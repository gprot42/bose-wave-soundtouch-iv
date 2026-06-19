/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { DiscoveredDevice } from '$lib/utils/boseShared';
import { fetchInfo } from '$lib/bose/soundtouch';
import { Capacitor } from '@capacitor/core';
import { getWifiNetworkInfo, isBoseSsid, nativeScanSubnet, subnetPrefixFromIp } from '$lib/native/wifiInfo';

const KNOWN_IPS_KEY = 'boseman_known_device_ips';

function loadKnownDeviceIps(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KNOWN_IPS_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveKnownDeviceIp(ip: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const known = new Set(loadKnownDeviceIps());
    known.add(ip.trim());
    localStorage.setItem(KNOWN_IPS_KEY, JSON.stringify(Array.from(known).slice(-10)));
  } catch {
    // ignore storage errors
  }
}

const FALLBACK_PREFIXES = [
  '192.0.2',
  '192.168.0',
  '192.168.1',
  '192.168.2',
  '192.168.4',
  '192.168.43',
  '192.168.178',
  '10.0.0',
  '10.42.0',
  '169.254'
];

const FALLBACK_GATEWAYS = [
  '192.0.2.1',
  '192.168.0.1',
  '192.168.1.1',
  '192.168.43.1',
  '192.168.178.1',
  '10.0.0.1',
  '10.42.0.1'
];

type ScanPlan = {
  priorityIps: string[];
  prefixes: string[];
  boseSetupAp: boolean;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null | undefined>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      const value = await fn(current);
      if (value != null) results.push(value);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function isBoseSetupNetwork(wifi: Awaited<ReturnType<typeof getWifiNetworkInfo>>): boolean {
  if (!wifi) return false;
  if (wifi.boseSetupAp) return true;
  if (isBoseSsid(wifi.ssid)) return true;
  // Bose Wave IV setup AP uses TEST-NET-1 (192.0.2.x); SSID may be hidden from apps on Android 10+
  return !!wifi.ip?.startsWith('192.0.2.');
}

async function buildScanPlan(): Promise<ScanPlan> {
  const wifi = await getWifiNetworkInfo();
  const onBoseWifi = isBoseSetupNetwork(wifi);
  const wifiPrefix = wifi?.ip ? subnetPrefixFromIp(wifi.ip) : null;

  if (onBoseWifi && wifi?.ip) {
    const prefix = subnetPrefixFromIp(wifi.ip);
    if (prefix) {
      const gateway = wifi.gateway || `${prefix}.1`;
      return {
        priorityIps: [gateway, `${prefix}.1`, wifi.ip],
        prefixes: [prefix],
        boseSetupAp: true
      };
    }
  }

  const priorityIps = new Set<string>([
    ...loadKnownDeviceIps(),
    ...(wifi?.gateway ? [wifi.gateway] : []),
    ...(wifiPrefix ? [`${wifiPrefix}.1`, wifi.ip!] : []),
    ...FALLBACK_GATEWAYS
  ]);
  const prefixes = new Set<string>([
    ...(wifiPrefix ? [wifiPrefix] : []),
    ...FALLBACK_PREFIXES
  ]);

  return {
    priorityIps: Array.from(priorityIps),
    prefixes: Array.from(prefixes),
    boseSetupAp: false
  };
}

function buildScanIps(priorityIps: string[], prefixes: string[]): string[] {
  const ips = new Set<string>(priorityIps);

  for (const prefix of prefixes) {
    for (let host = 1; host <= 254; host++) {
      ips.add(`${prefix}.${host}`);
    }
  }

  return [...priorityIps, ...Array.from(ips).filter((ip) => !priorityIps.includes(ip))];
}

async function probeIp(ip: string, fetchTimeoutMs: number): Promise<DiscoveredDevice | null> {
  const meta = await fetchInfo(ip, fetchTimeoutMs);
  if (!meta?.name && !meta?.deviceID && !meta?.mac) return null;
  return { ip, ...meta } as DiscoveredDevice;
}

export async function discoverDeviceByIp(ip: string, fetchTimeoutMs = 4000): Promise<DiscoveredDevice | null> {
  const device = await probeIp(ip.trim(), fetchTimeoutMs);
  if (device) saveKnownDeviceIp(device.ip);
  return device;
}

export async function discoverDevicesBySubnet(fetchTimeoutMs = 1500): Promise<DiscoveredDevice[]> {
  const { priorityIps, prefixes } = await buildScanPlan();
  const uniquePriority = Array.from(new Set(priorityIps));

  // Phase 1: priority IPs (known devices + gateways) — all at once
  let found = await mapWithConcurrency(uniquePriority, uniquePriority.length, (ip) =>
    probeIp(ip, fetchTimeoutMs)
  );

  // Phase 2: fast TCP port-8090 sweep per subnet, then confirm hits via HTTP /info.
  // The native scanner resolves + binds the Wi-Fi network once and connect-probes
  // the whole /24 with a short timeout, so a dead host costs ~400ms (not 1500ms).
  if (found.length === 0 && Capacitor.isNativePlatform()) {
    for (const prefix of prefixes) {
      const openHosts = await nativeScanSubnet(prefix, { port: 8090, connectTimeoutMs: 400, concurrency: 64 });
      if (openHosts.length === 0) continue;
      const confirmed = await mapWithConcurrency(openHosts, openHosts.length, (ip) =>
        probeIp(ip, fetchTimeoutMs)
      );
      if (confirmed.length > 0) {
        found = confirmed;
        break; // first subnet with a real SoundTouch device wins
      }
    }
  }

  // Web fallback (no native plugin): full subnet HTTP sweep
  if (found.length === 0 && !Capacitor.isNativePlatform()) {
    found = await mapWithConcurrency(buildScanIps(uniquePriority, prefixes), 80, (ip) =>
      probeIp(ip, fetchTimeoutMs)
    );
  }

  const byIp = new Map<string, DiscoveredDevice>();
  for (const device of found) {
    byIp.set(device.ip, device);
    saveKnownDeviceIp(device.ip);
  }
  return Array.from(byIp.values());
}

export async function getDiscoveryContext(): Promise<ScanPlan & { wifi: Awaited<ReturnType<typeof getWifiNetworkInfo>> }> {
  const wifi = await getWifiNetworkInfo();
  const plan = await buildScanPlan();
  return { ...plan, wifi };
}