/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { MediaServer } from '$lib/bose/dlna';
import { parseDeviceDescription, type UpnpDeviceKind } from '$lib/bose/dlna';
import { Capacitor } from '@capacitor/core';
import {
  getWifiNetworkInfo,
  nativeHttpGet,
  nativeScanSubnet,
  nativeSsdpSearch,
  subnetPrefixFromIp
} from '$lib/native/wifiInfo';

export type DiscoveredUpnpDevice = MediaServer & {
  kind: UpnpDeviceKind;
  address?: string;
};

// Ports that commonly serve a UPnP/DLNA device description.
const DLNA_PORTS = [8091, 49494, 8200, 49152, 49153, 5000, 32469];
const DLNA_PATHS = ['/', '/description.xml', '/rootDesc.xml', '/DeviceDescription.xml'];

async function fetchXml(location: string, timeoutMs = 2000): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await nativeHttpGet(location, timeoutMs);
      if (!res?.ok || !res.body) return null;
      return res.body;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(location, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function describeDevice(location: string, timeoutMs = 2000): Promise<DiscoveredUpnpDevice | null> {
  const xml = await fetchXml(location, timeoutMs);
  if (!xml) return null;
  const meta = parseDeviceDescription(xml);
  if (!meta.udn) return null;
  let address: string | undefined;
  try {
    address = new URL(location).hostname;
  } catch {
    address = undefined;
  }
  return {
    id: meta.udn,
    friendlyName: meta.friendlyName || 'UPnP Device',
    location,
    kind: meta.kind,
    address
  };
}

async function describeAll(locations: string[]): Promise<DiscoveredUpnpDevice[]> {
  const byId = new Map<string, DiscoveredUpnpDevice>();
  let index = 0;
  const workers = Array.from({ length: 12 }, async () => {
    while (index < locations.length) {
      const location = locations[index++];
      const device = await describeDevice(location);
      if (device && !byId.has(device.id)) byId.set(device.id, device);
    }
  });
  await Promise.all(workers);
  return Array.from(byId.values());
}

/**
 * Discover UPnP/DLNA devices on the network via SSDP (fast, standards-based).
 * Returns every discovered device classified as a media `server`, a
 * `renderer` (e.g. the Bose SoundTouch, smart TVs), or `other`.
 */
export async function discoverMediaServersBySubnet(): Promise<DiscoveredUpnpDevice[]> {
  if (Capacitor.isNativePlatform()) {
    const responses = await nativeSsdpSearch(3000);
    const locations = Array.from(new Set(responses.map((r) => r.location).filter(Boolean)));
    if (locations.length > 0) {
      const devices = await describeAll(locations);
      if (devices.length > 0) return devices;
    }
  }
  return subnetScanFallback();
}

/**
 * Last-resort scan used only when SSDP yields nothing. Uses the fast native
 * batch TCP scanner to find hosts with an open UPnP port, then only fetches a
 * device description from those candidates (avoids brute-forcing the subnet).
 */
async function subnetScanFallback(): Promise<DiscoveredUpnpDevice[]> {
  if (!Capacitor.isNativePlatform()) return [];

  const wifi = await getWifiNetworkInfo();
  const prefix = wifi?.ip ? subnetPrefixFromIp(wifi.ip) : null;
  if (!prefix) return [];

  // Fast batch TCP scan per candidate port (each ~1-2s, runs natively).
  const candidates = new Set<string>();
  for (const port of DLNA_PORTS) {
    const hosts = await nativeScanSubnet(prefix, { port, connectTimeoutMs: 400, concurrency: 64 });
    for (const host of hosts) {
      for (const path of DLNA_PATHS) {
        candidates.add(`http://${host}:${port}${path}`);
      }
    }
  }

  if (candidates.size === 0) return [];
  return describeAll(Array.from(candidates));
}
