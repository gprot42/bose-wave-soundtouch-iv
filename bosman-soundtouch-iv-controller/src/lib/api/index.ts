/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { Capacitor } from '@capacitor/core';
import { discoverDeviceByIp, discoverDevicesBySubnet } from '$lib/bose/discovery';
import { discoverMediaServersBySubnet } from '$lib/bose/discoveryDlna';
import { browseMediaServer, getMediaServerDescription } from '$lib/bose/dlna';
import {
  addZoneSlave,
  boseBrowse,
  boseSelectStoredMusic,
  getNowPlaying,
  getPresets,
  getVolume,
  getZone,
  listMediaServers,
  pause,
  play,
  power,
  pressKey,
  removeZoneSlave,
  setMusicServiceAccount,
  setVolume,
  setZone,
  stop,
  storePreset
} from '$lib/bose/soundtouch';
import { fetchJson } from '$lib/utils/fetchJson';
import type { DiscoveredDevice, NowPlayingInfo, Preset, VolumeInfo, ZoneInfo } from '$lib/utils/boseShared';

function useLocalApi(): boolean {
  return Capacitor.isNativePlatform();
}

export async function apiDiscoverDevices(): Promise<DiscoveredDevice[]> {
  if (useLocalApi()) return discoverDevicesBySubnet();
  const data = await fetchJson<{ devices?: DiscoveredDevice[] }>('/api/devices');
  return data.devices ?? [];
}

export async function apiDiscoverDeviceByIp(ip: string): Promise<DiscoveredDevice | null> {
  if (useLocalApi()) return discoverDeviceByIp(ip);
  const devices = await apiDiscoverDevices();
  return devices.find((d) => d.ip === ip) ?? null;
}

export async function apiGetNowPlaying(ip: string): Promise<NowPlayingInfo | null> {
  if (useLocalApi()) return getNowPlaying(ip);
  const data = await fetchJson<{ nowPlaying: NowPlayingInfo | null }>(`/api/nowplaying/${encodeURIComponent(ip)}`);
  return data.nowPlaying;
}

export async function apiGetVolume(ip: string): Promise<VolumeInfo | null> {
  if (useLocalApi()) return getVolume(ip);
  const data = await fetchJson<{ volume: VolumeInfo | null }>(`/api/volume/${encodeURIComponent(ip)}`);
  return data.volume;
}

export async function apiGetPresets(ip: string): Promise<Preset[]> {
  if (useLocalApi()) return getPresets(ip);
  const data = await fetchJson<{ presets: Preset[] }>(`/api/presets/${encodeURIComponent(ip)}`);
  return data.presets ?? [];
}

export async function apiSetVolume(ip: string, volume: number): Promise<void> {
  if (useLocalApi()) return setVolume(ip, volume);
  const res = await fetch(`/api/volume/${encodeURIComponent(ip)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ volume })
  });
  if (!res.ok) throw new Error(`Set volume failed: ${res.status}`);
}

export async function apiSendCommand(action: string, ip: string): Promise<void> {
  if (useLocalApi()) {
    const normalized = action.toLowerCase();
    if (normalized === 'power') return power(ip);
    if (normalized === 'play') return play(ip);
    if (normalized === 'pause') return pause(ip);
    if (normalized === 'stop') return stop(ip);
    return pressKey(ip, action.toUpperCase());
  }
  const res = await fetch(`/api/command/${action}/${encodeURIComponent(ip)}`, { method: 'POST' });
  if (!res.ok && res.status !== 204) throw new Error(`Command ${action} failed: ${res.status}`);
}

export async function apiStorePreset(ip: string, id: number, item: NowPlayingInfo): Promise<void> {
  if (useLocalApi()) return storePreset(ip, id, item);
  const res = await fetch(`/api/presets/${encodeURIComponent(ip)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, item })
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Store preset failed: ${res.status} ${msg}`);
  }
}

export async function apiListMediaServers(ip: string) {
  if (useLocalApi()) return listMediaServers(ip);
  const data = await fetchJson<{ servers: Awaited<ReturnType<typeof listMediaServers>> }>(
    `/api/media-servers/${encodeURIComponent(ip)}`
  );
  return data.servers ?? [];
}

export async function apiDiscoverDlnaServers() {
  if (useLocalApi()) return discoverMediaServersBySubnet();
  const data = await fetchJson<{ servers: Awaited<ReturnType<typeof discoverMediaServersBySubnet>> }>('/api/dlna/discover');
  return data.servers ?? [];
}

export async function apiBrowse(deviceIp: string, sourceAccount: string, containerLocation?: string) {
  if (useLocalApi()) {
    return boseBrowse(deviceIp, {
      source: 'STORED_MUSIC',
      sourceAccount,
      containerLocation
    });
  }
  const params = new URLSearchParams({ deviceIp, sourceAccount });
  if (containerLocation) params.set('containerLocation', containerLocation);
  const data = await fetchJson<{ items: Awaited<ReturnType<typeof boseBrowse>> }>(`/api/browse?${params.toString()}`);
  return data.items ?? [];
}

export async function apiBrowseDlna(args: {
  location?: string;
  baseUrl?: string;
  controlUrl?: string;
  objectId?: string;
}) {
  if (useLocalApi()) {
    let baseUrl = args.baseUrl;
    let controlUrl = args.controlUrl;
    if (args.location && (!baseUrl || !controlUrl)) {
      const desc = await getMediaServerDescription(args.location);
      baseUrl = desc.baseUrl;
      controlUrl = desc.controlUrl;
    }
    if (!baseUrl || !controlUrl) throw new Error('Missing baseUrl or controlUrl');
    const items = await browseMediaServer(baseUrl, controlUrl, args.objectId || '0');
    return { items, baseUrl, controlUrl };
  }
  const params = new URLSearchParams();
  if (args.location) params.set('location', args.location);
  if (args.baseUrl) params.set('baseUrl', args.baseUrl);
  if (args.controlUrl) params.set('controlUrl', args.controlUrl);
  params.set('objectId', args.objectId || '0');
  return fetchJson<{ items: any[]; baseUrl: string; controlUrl: string }>(`/api/dlna/browse?${params.toString()}`);
}

export async function apiSelectMusic(args: {
  deviceIp: string;
  sourceAccount: string;
  location: string;
  itemName: string;
}): Promise<void> {
  if (useLocalApi()) {
    return boseSelectStoredMusic(args.deviceIp, args);
  }
  const res = await fetch('/api/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok && res.status !== 204) throw new Error(`Select failed: ${res.status}`);
}

export async function apiSetMusicServiceAccount(deviceIp: string, displayName: string, userId: string): Promise<void> {
  if (useLocalApi()) return setMusicServiceAccount(deviceIp, displayName, userId);
  const res = await fetch('/api/music-service-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceIp, displayName, userId })
  });
  if (!res.ok && res.status !== 204) throw new Error(`Set account failed: ${res.status}`);
}

export async function apiGetZone(ip: string): Promise<ZoneInfo | null> {
  if (useLocalApi()) return getZone(ip);
  return fetchJson<ZoneInfo>(`/api/zone/${encodeURIComponent(ip)}`);
}

async function resolveMasterIp(ip: string, masterMac: string): Promise<string> {
  try {
    const zone = await apiGetZone(ip);
    const match = zone?.members?.find((m) => (m.mac || '').toLowerCase() === masterMac.toLowerCase());
    return match?.ip || ip;
  } catch {
    return ip;
  }
}

export async function apiZoneAdd(
  ip: string,
  payload: { masterMac: string; slave: { ip: string; mac: string } }
): Promise<void> {
  if (useLocalApi()) {
    const targetIp = await resolveMasterIp(ip, payload.masterMac);
    const currentZone = await getZone(targetIp).catch(() => null);
    const hasRealZone = !!(currentZone?.master && currentZone.members && currentZone.members.length > 1);
    if (hasRealZone) {
      await addZoneSlave(targetIp, payload.masterMac, payload.slave);
    } else {
      await setZone(targetIp, payload.masterMac, [
        { ip: targetIp, mac: payload.masterMac },
        payload.slave
      ], targetIp);
    }
    return;
  }
  const res = await fetch(`/api/zone/${encodeURIComponent(ip)}?action=add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok && res.status !== 204) throw new Error(`Zone add failed: ${res.status}`);
}

export async function apiZoneRemove(
  ip: string,
  payload: { masterMac: string; slave: { ip: string; mac: string } }
): Promise<void> {
  if (useLocalApi()) {
    const targetIp = await resolveMasterIp(ip, payload.masterMac);
    await removeZoneSlave(targetIp, payload.masterMac, payload.slave);
    return;
  }
  const res = await fetch(`/api/zone/${encodeURIComponent(ip)}?action=remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok && res.status !== 204) throw new Error(`Zone remove failed: ${res.status}`);
}

export async function apiZoneSet(
  ip: string,
  payload: { masterMac: string; members: { ip: string; mac: string }[]; senderIPAddress?: string }
): Promise<void> {
  if (useLocalApi()) {
    const candidate = payload.members.find((m) => (m.mac || '').toLowerCase() === payload.masterMac.toLowerCase());
    const targetIp = candidate?.ip || ip;
    await setZone(targetIp, payload.masterMac, payload.members, payload.senderIPAddress);
    return;
  }
  const res = await fetch(`/api/zone/${encodeURIComponent(ip)}?action=set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok && res.status !== 204) throw new Error(`Zone set failed: ${res.status}`);
}