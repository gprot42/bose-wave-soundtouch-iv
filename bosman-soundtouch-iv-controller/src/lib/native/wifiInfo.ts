/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export type WifiNetworkInfo = {
  ip?: string;
  gateway?: string;
  prefix?: string;
  ssid?: string;
  boseSetupAp?: boolean;
  wifi?: boolean;
  validated?: boolean;
  bound?: boolean;
  requested?: boolean;
  reason?: string;
  error?: string;
};

export type NativeHttpResponse = {
  status?: number;
  body?: string;
  ok?: boolean;
  error?: string;
};

export type NativeTcpResponse = {
  body?: string;
  ok?: boolean;
  connected?: boolean;
  ip?: string;
  gateway?: string;
  ssid?: string;
  error?: string;
};

export type SsdpDevice = {
  location: string;
  st?: string;
  usn?: string;
  server?: string;
  address?: string;
};

interface WifiInfoPlugin {
  getNetworkInfo(): Promise<WifiNetworkInfo>;
  retainLocalWifi(): Promise<WifiNetworkInfo>;
  releaseNetworkBinding(): Promise<WifiNetworkInfo>;
  httpGet(options: { url: string; timeoutMs?: number }): Promise<NativeHttpResponse>;
  httpPost(options: {
    url: string;
    body?: string;
    contentType?: string;
    soapAction?: string;
    timeoutMs?: number;
  }): Promise<NativeHttpResponse>;
  tcpCommand(options: {
    host: string;
    port?: number;
    command: string;
    timeoutMs?: number;
    connectTimeoutMs?: number;
  }): Promise<NativeTcpResponse>;
  tcpProbe(options: { host: string; port?: number; connectTimeoutMs?: number }): Promise<NativeTcpResponse>;
  tcpPortScan(options: {
    host: string;
    ports?: string;
    connectTimeoutMs?: number;
  }): Promise<NativeTcpResponse & { openPorts?: number[] }>;
  scanSubnet(options: {
    prefix: string;
    port?: number;
    connectTimeoutMs?: number;
    startHost?: number;
    endHost?: number;
    concurrency?: number;
  }): Promise<{ ok?: boolean; openHosts?: string[]; error?: string }>;
  ssdpSearch(options: {
    timeoutMs?: number;
  }): Promise<{ ok?: boolean; devices?: SsdpDevice[]; error?: string }>;
}

const WifiInfo = registerPlugin<WifiInfoPlugin>('WifiInfo');

export async function getWifiNetworkInfo(): Promise<WifiNetworkInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.getNetworkInfo();
  } catch {
    return null;
  }
}

export async function retainLocalWifi(): Promise<WifiNetworkInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.retainLocalWifi();
  } catch {
    return null;
  }
}

export async function releaseNetworkBinding(): Promise<WifiNetworkInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.releaseNetworkBinding();
  } catch {
    return null;
  }
}

export async function nativeHttpGet(url: string, timeoutMs = 3500): Promise<NativeHttpResponse | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.httpGet({ url, timeoutMs });
  } catch {
    return null;
  }
}

export async function nativeHttpPost(
  url: string,
  body: string,
  contentType = 'application/x-www-form-urlencoded',
  timeoutMs = 6000,
  soapAction?: string
): Promise<NativeHttpResponse | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.httpPost({ url, body, contentType, timeoutMs, soapAction });
  } catch {
    return null;
  }
}

export function subnetPrefixFromIp(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

export function isBoseSsid(ssid?: string): boolean {
  if (!ssid) return false;
  const lower = ssid.toLowerCase();
  return lower.includes('bose') || lower.includes('soundtouch') || lower.includes('bose_setup');
}

export async function nativeTcpCommand(
  host: string,
  command: string,
  options: { port?: number; timeoutMs?: number; connectTimeoutMs?: number } = {}
): Promise<NativeTcpResponse | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.tcpCommand({
      host,
      command,
      port: options.port ?? 17000,
      timeoutMs: options.timeoutMs,
      connectTimeoutMs: options.connectTimeoutMs ?? 8000
    });
  } catch {
    return null;
  }
}

export async function nativeTcpPortScan(
  host: string,
  ports = '17000,8090,80,8080,443,23,12500,7000,3000',
  connectTimeoutMs = 2500
): Promise<(NativeTcpResponse & { openPorts?: number[] }) | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.tcpPortScan({ host, ports, connectTimeoutMs });
  } catch {
    return null;
  }
}

export async function nativeTcpProbe(
  host: string,
  options: { port?: number; connectTimeoutMs?: number } = {}
): Promise<NativeTcpResponse | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await WifiInfo.tcpProbe({
      host,
      port: options.port ?? 17000,
      connectTimeoutMs: options.connectTimeoutMs ?? 8000
    });
  } catch {
    return null;
  }
}

export async function nativeScanSubnet(
  prefix: string,
  options: { port?: number; connectTimeoutMs?: number; concurrency?: number } = {}
): Promise<string[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const res = await WifiInfo.scanSubnet({
      prefix,
      port: options.port ?? 8090,
      connectTimeoutMs: options.connectTimeoutMs ?? 400,
      concurrency: options.concurrency ?? 64
    });
    return res?.openHosts ?? [];
  } catch {
    return [];
  }
}

export async function nativeSsdpSearch(timeoutMs = 3000): Promise<SsdpDevice[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const res = await WifiInfo.ssdpSearch({ timeoutMs });
    return res?.devices ?? [];
  } catch {
    return [];
  }
}