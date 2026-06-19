/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { XMLParser } from 'fast-xml-parser';
import { Capacitor } from '@capacitor/core';
import { nativeHttpGet, nativeHttpPost } from '$lib/native/wifiInfo';
import type { DiscoveredDevice, NowPlayingInfo, Preset, VolumeInfo, ZoneInfo } from '$lib/utils/boseShared';
import {
  parseNowPlayingXml as sharedParseNowPlayingXml,
  parseVolumeXml as sharedParseVolumeXml
} from '$lib/utils/boseShared';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true
});

export type MediaServerBrief = {
  id: string; // UDN/user id without 'uuid:'
  friendlyName: string;
};

function isIPv6(host: string) {
  return host.includes(':');
}

function bracketHostIfNeeded(host: string) {
  return isIPv6(host) ? `[${host}]` : host;
}

function parseInfoXml(xml: string) {
  const obj = parser.parse(xml);
  const info = obj?.info;
  const device = obj?.root?.device || obj?.device;
  const target = info || device;
  if (!target) return {} as Partial<DiscoveredDevice>;

  const deviceID = (target.deviceID || target.deviceid || target.UDN || target.udn)?.replace(/^uuid:/i, '')?.trim();
  
  // Extrahiere MAC aus Komponenten-Liste (kann Objekt oder Array sein)
  let mac = target.macAddress || target.mac;
  if (!mac && target.components?.component) {
    const comps = Array.isArray(target.components.component) 
      ? target.components.component 
      : [target.components.component];
    mac = comps.find((c: any) => c.macAddress)?.macAddress;
  }

  // Extrahiere Software Version und Serial Number aus Komponenten
  let softwareVersion = '';
  let serialNumber = '';
  if (target.components?.component) {
    const comps = Array.isArray(target.components.component) 
      ? target.components.component 
      : [target.components.component];
    const mainComp = comps.find((c: any) => c.componentCategory === 'SCU' || c.softwareVersion);
    if (mainComp) {
      softwareVersion = mainComp.softwareVersion;
      serialNumber = mainComp.serialNumber;
    }
  }

  // Extrahiere alle MAC-Adressen
  const macAddresses: string[] = [];
  if (target.networkInfo) {
    const netInfos = Array.isArray(target.networkInfo) ? target.networkInfo : [target.networkInfo];
    netInfos.forEach((ni: any) => {
      if (ni.macAddress) macAddresses.push(ni.macAddress);
    });
  }
  // Falls macAddress direkt in target steht
  if (target.macAddress && !macAddresses.includes(target.macAddress)) {
    macAddresses.push(target.macAddress);
  }

  return {
    name: (target.name || target.friendlyName)?.trim(),
    deviceID,
    type: (target.type || target.modelName || 'SoundTouch')?.trim(),
    mac: (mac || deviceID)?.trim(), // Fallback auf deviceID, da diese meist die MAC ist
    softwareVersion,
    serialNumber,
    macAddresses
  } as Partial<DiscoveredDevice>;
}

export async function fetchInfo(ip: string, fetchTimeoutMs = 2000): Promise<Partial<DiscoveredDevice> | null> {
  const hostPart = bracketHostIfNeeded(ip);
  const url = `http://${hostPart}:8090/info`;
  try {
    if (Capacitor.isNativePlatform()) {
      // Try the WifiInfo plugin first (uses network-bound HTTP)
      const res = await nativeHttpGet(url, fetchTimeoutMs);
      if (res?.ok && res.body) return parseInfoXml(res.body);
      // Plugin failed (e.g. network-binding error) — fall through to
      // Capacitor-intercepted fetch() as a second attempt
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!text) return null;
    return parseInfoXml(text);
  } catch {
    return null;
  }
}

// Send POWER key (press and release) to a SoundTouch device
export async function pressKey(ip: string, key: string): Promise<void> {
  const host = bracketHostIfNeeded(ip);
  const url = `http://${host}:8090/key`;
  const press = `<key state="press" sender="Gabbo">${key}</key>`;
  const release = `<key state="release" sender="Gabbo">${key}</key>`;

  async function postXml(body: string, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  await postXml(press);
  await postXml(release);
}

export async function power(ip: string): Promise<void> {
  return pressKey(ip, 'POWER');
}

export async function play(ip: string): Promise<void> {
  return pressKey(ip, 'PLAY');
}

export async function pause(ip: string): Promise<void> {
  return pressKey(ip, 'PAUSE');
}

export async function stop(ip: string): Promise<void> {
  return pressKey(ip, 'STOP');
}


// ---- Zone helpers ----

function parseZoneXml(xml: string): ZoneInfo | null {
  const obj = parser.parse(xml);
  const zone = obj?.zone;
  if (!zone) return null;

  const master = zone.master;
  const members: { ip: string; mac: string }[] = [];
  const rawMembers = zone.member ? (Array.isArray(zone.member) ? zone.member : [zone.member]) : [];
  for (const m of rawMembers) {
    if (m.ipaddress && m['#text']) {
      members.push({ ip: m.ipaddress, mac: m['#text'].trim() });
    }
  }

  return { master, members };
}

export async function getNowPlaying(ip: string): Promise<NowPlayingInfo | null> {
  try {
    const xml = await httpGet(ip, '/now_playing');
    return sharedParseNowPlayingXml(xml);
  } catch (e) {
    console.error(`getNowPlaying failed for ${ip}:`, e);
    return null;
  }
}

export const parseNowPlayingXml = sharedParseNowPlayingXml;

export async function getVolume(ip: string): Promise<VolumeInfo | null> {
  try {
    const xml = await httpGet(ip, '/volume');
    return sharedParseVolumeXml(xml);
  } catch (e) {
    console.error(`getVolume failed for ${ip}:`, e);
    return null;
  }
}

export const parseVolumeXml = sharedParseVolumeXml;

export async function getPresets(ip: string): Promise<Preset[]> {
  try {
    const xml = await httpGet(ip, '/presets');
    return parsePresetsXml(xml);
  } catch (e) {
    console.error(`getPresets failed for ${ip}:`, e);
    return [];
  }
}

function parsePresetsXml(xml: string): Preset[] {
  const obj = parser.parse(xml);
  const presetsObj = obj?.presets;
  if (!presetsObj) return [];

  const rawPresets = presetsObj.preset ? (Array.isArray(presetsObj.preset) ? presetsObj.preset : [presetsObj.preset]) : [];
  return rawPresets.map((p: any) => ({
    id: Number.parseInt(p.id, 10),
    itemName: p.ContentItem?.itemName || '',
    source: p.ContentItem?.source || '',
    location: p.ContentItem?.location || '',
    sourceAccount: p.ContentItem?.sourceAccount
  }));
}

export async function storePreset(ip: string, id: number, item: NowPlayingInfo): Promise<void> {
  const sourceAccount = ` sourceAccount="${escapeXml(item.sourceAccount || '')}"`;
  const location = item.location ? ` location="${escapeXml(item.location)}"` : '';
  const isPresetable = item.isPresetable !== false ? 'true' : 'false';
  const itemName = escapeXml(item.itemName || item.stationName || item.track || '');

  // According to dlna.http and user feedback, the endpoint is /storePreset
  // and the body contains the <preset> tag.
  const body = `<preset id="${id}"><ContentItem source="${item.source}"${sourceAccount}${location} isPresetable="${isPresetable}"><itemName>${itemName}</itemName></ContentItem></preset>`;

  await httpPost(ip, '/storePreset', body);
}

export async function setVolume(ip: string, volume: number): Promise<void> {
  const body = `<volume>${volume}</volume>`;
  await httpPost(ip, '/volume', body);
}

async function httpGet(ip: string, path: string, timeoutMs = 4000): Promise<string> {
  const host = bracketHostIfNeeded(ip);
  const url = `http://${host}:8090${path}`;
  if (Capacitor.isNativePlatform()) {
    const native = await nativeHttpGet(url, timeoutMs);
    if (native?.ok && native.body) return native.body;
    throw new Error(`GET ${path} failed: ${native?.status || 0} ${native?.error || 'native HTTP failed'}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`GET ${path} failed: ${res.status} ${errorText}`);
    }
    return await res.text();
  } catch (e: any) {
    console.error(`httpGet failed for ${url}:`, e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function httpPost(ip: string, path: string, body: string, timeoutMs = 5000): Promise<void> {
  const host = bracketHostIfNeeded(ip);
  const url = `http://${host}:8090${path}`;
  if (Capacitor.isNativePlatform()) {
    const native = await nativeHttpPost(url, body, 'text/xml; charset=utf-8', timeoutMs);
    if (native?.ok || native?.status === 204) return;
    throw new Error(`HTTP ${native?.status || 0} posting to ${path}: ${native?.error || native?.body || 'native HTTP failed'}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log(`POST ${url} ${body}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body,
      signal: controller.signal
    });
    if (!res.ok && res.status !== 204) {
      console.error(`ERROR POST ${url} ${body} ${res.status}`);
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} posting to ${path}: ${text}`);
    } else {
      console.log(`OK POST ${url} ${body} ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function getZone(ip: string): Promise<ZoneInfo | null> {
  const xml = await httpGet(ip, '/getZone');
  if (!xml || /<errors|<error/i.test(xml)) {
    // Fall back to synthesizing a minimal zone so the UI can still show the device list
    const meta = await fetchInfo(ip).catch(() => null);
    if (meta?.mac) {
      return { master: meta.mac, members: [{ ip, mac: meta.mac }] };
    }
    return { master: '', members: [] };
  }
  const parsed = parseZoneXml(xml);
  if (parsed) return parsed;
  // Some devices may return an empty <zone/> without master; synthesize a minimal zone
  const meta = await fetchInfo(ip).catch(() => null);
  if (meta?.mac) {
    return { master: meta.mac, members: [{ ip, mac: meta.mac }] };
  }
  return { master: '', members: [] };
}

// ---- Media servers on a specific SoundTouch device ----

function normalizeUuid(id?: string | null): string | undefined {
  const uuidMatch = id?.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return uuidMatch ? uuidMatch[0].toLowerCase() : undefined;
}

export async function listMediaServers(ip: string): Promise<MediaServerBrief[]> {
  try {
    let xml = '';
    try {
      xml = await httpGet(ip, '/sources', 5000);
    } catch (e: any) {
      console.warn(`GET /sources failed for ${ip}, trying POST fallback:`, e?.message || e);
      await httpPost(ip, '/sources', '', 5000);
      xml = await httpGet(ip, '/sources', 5000);
    }
    if (!xml) return [];

    const obj = parser.parse(xml);
    const sources = obj?.sources;
    if (!sources) return [];

    const rawItems = sources.sourceItem ? (Array.isArray(sources.sourceItem) ? sources.sourceItem : [sources.sourceItem]) : [];
    const servers: MediaServerBrief[] = [];

    for (const b of rawItems) {
      const sourceAttr = b.source;
      const isStored = /STORED_MUSIC/i.test(sourceAttr || '');
      if (!isStored) continue;

      // Extract ID from sourceAccount or account or user
      let id: string | undefined;
      const srcAcc = b.sourceAccount;
      if (srcAcc) {
        id = normalizeUuid(srcAcc.split('/')[0].replace(/^uuid:/i, ''));
      }
      if (!id && b.account) {
        id = normalizeUuid(b.account.split('/')[0].replace(/^uuid:/i, ''));
      }
      if (!id && b.user) {
        id = normalizeUuid(b.user.replace(/^uuid:/i, ''));
      }

      // Extract Name
      let name = b['#text'] || b.sourceFriendlyName || b.friendlyName || b.displayName || b.name;
      if (typeof name === 'string') name = name.trim();

      if (id) servers.push({ id, friendlyName: name || 'Media Server' });
    }

    if (servers.length > 0) {
      const map = new Map<string, MediaServerBrief>();
      for (const s of servers) if (!map.has(s.id)) map.set(s.id, s);
      return Array.from(map.values());
    }

    // Fallback: try to extract from whole XML if parsing sourceItems failed to find STORED_MUSIC
    const fallbackId = normalizeUuid(xml?.replace(/^uuid:/i, ''));
    if (fallbackId) {
      const fallbackName = obj?.friendlyName || obj?.displayName || obj?.name;
      if (fallbackName) return [{ id: fallbackId, friendlyName: fallbackName.trim() }];
    }

    return [];
  } catch (e: any) {
    console.error(`listMediaServers failed for ${ip}:`, e);
    return [];
  }
}

// ---- Media browsing / selection helpers (STORED_MUSIC, SEARCH etc.) ----

export type BrowseParams = {
  source: 'STORED_MUSIC';
  sourceAccount: string; // e.g. "<uuid>/0"
  containerLocation?: string; // when omitted, browse root
  startItem?: number;
  numItems?: number;
};

export type BrowseItem = {
  type: 'container' | 'item';
  title: string;
  location?: string; // for playable items
  containerLocation?: string; // for navigating into containers
};

export async function boseBrowse(ip: string, params: BrowseParams): Promise<BrowseItem[]> {
  const { source, sourceAccount, containerLocation, startItem = 1, numItems = 200 } = params;
  const xml = [`<browse source="${source}" sourceAccount="${escapeXml(sourceAccount)}">`];
  if (containerLocation) xml.push(`<containerLocation>${escapeXml(containerLocation)}</containerLocation>`);
  xml.push(`<startItem>${startItem}</startItem>`);
  xml.push(`<numItems>${numItems}</numItems>`);
  xml.push(`</browse>`);
  const body = xml.join('');
  const host = bracketHostIfNeeded(ip);
  const url = `http://${host}:8090/browse`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body,
      signal: controller.signal
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Browse failed: ${res.status} ${errorText}`);
    }
    const text = await res.text();
    return parseBrowseResponse(text);
  } catch (e: any) {
    console.error(`boseBrowse failed for ${ip}:`, e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function boseSelectStoredMusic(ip: string, args: { sourceAccount: string; location: string; itemName: string; isPresetable?: boolean }) {
  const isPresetable = args.isPresetable ?? true;
  const body =
    `<ContentItem source="STORED_MUSIC" sourceAccount="${escapeXml(args.sourceAccount)}" location="${escapeXml(args.location)}" isPresetable="${isPresetable ? 'true' : 'false'}">` +
    `<itemName>${escapeXml(args.itemName)}</itemName>` +
    `</ContentItem>`;
  await httpPost(ip, '/select', body);
}

export async function setMusicServiceAccount(ip: string, displayName: string, userId: string) {
  const body =
    `<credentials source="STORED_MUSIC" displayName="${escapeXml(displayName)}">` +
    `<user>${escapeXml(userId)}</user>` +
    `<pass/>` +
    `</credentials>`;
  await httpPost(ip, '/setMusicServiceAccount', body);
}

function escapeXml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

function parseBrowseResponse(xml: string): BrowseItem[] {
  const obj = parser.parse(xml);
  const browse = obj?.browse;
  if (!browse) return [];

  const items: BrowseItem[] = [];
  const rawItems = browse.items?.item ? (Array.isArray(browse.items.item) ? browse.items.item : [browse.items.item]) : [];

  for (const i of rawItems) {
    const title = (i.itemName || 'Unknown').trim();
    if (i.type === 'container') {
      items.push({
        type: 'container',
        title,
        containerLocation: i.containerLocation
      });
    } else {
      items.push({
        type: 'item',
        title,
        location: i.location
      });
    }
  }

  return items;
}

export async function setZone(masterIp: string, masterMac: string, members: { ip: string; mac: string }[], senderIPAddress?: string): Promise<void> {
  const sender = senderIPAddress || masterIp;
  // Normalize master MAC and ensure master is included as the first member; de-duplicate by MAC
  const normMasterMac = masterMac.trim().toUpperCase();
  const seen = new Set<string>();
  const normMembers = [] as { ip: string; mac: string }[];
  // Ensure master first
  normMembers.push({ ip: masterIp, mac: normMasterMac });
  seen.add(normMasterMac);
  for (const m of members) {
    const macUp = (m.mac || '').trim().toUpperCase();
    if (!macUp || seen.has(macUp)) continue;
    normMembers.push({ ip: m.ip, mac: macUp });
    seen.add(macUp);
  }
  const body = [
    `<zone master="${normMasterMac}" senderIPAddress="${sender}">`,
    ...normMembers.map((m) => `  <member ipaddress="${m.ip}">${m.mac}</member>`),
    `</zone>`
  ].join('\n');
  await httpPost(masterIp, '/setZone', body);
}

export async function addZoneSlave(masterIp: string, masterMac: string, slave: { ip: string; mac: string }): Promise<void> {
  const normMasterMac = (masterMac || '').trim().toUpperCase();
  const normSlaveMac = (slave.mac || '').trim().toUpperCase();
  const body = [
    `<zone master="${normMasterMac}">`,
    `  <member ipaddress="${slave.ip}">${normSlaveMac}</member>`,
    `</zone>`
  ].join('\n');
  await httpPost(masterIp, '/addZoneSlave', body);
}

export async function removeZoneSlave(masterIp: string, masterMac: string, slave: { ip: string; mac: string }): Promise<void> {
  const normMasterMac = (masterMac || '').trim().toUpperCase();
  const normSlaveMac = (slave.mac || '').trim().toUpperCase();
  const body = [
    `<zone master="${normMasterMac}">`,
    `  <member ipaddress="${slave.ip}">${normSlaveMac}</member>`,
    `</zone>`
  ].join('\n');
  await httpPost(masterIp, '/removeZoneSlave', body);
}
