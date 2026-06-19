/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

export interface SoundTouchUpdate {
  nowPlaying?: NowPlayingInfo;
  volume?: VolumeInfo;
  presetsChanged?: boolean;
}

export type UpdateCallback = (update: SoundTouchUpdate) => void;
export type ConnectionCallback = (connected: boolean) => void;

export interface NowPlayingInfo {
  source: string;
  sourceAccount?: string;
  track?: string;
  artist?: string;
  album?: string;
  stationName?: string;
  art?: string;
  artStatus?: string;
  playStatus?: string;
  description?: string;
  itemName?: string;
  location?: string;
  isPresetable?: boolean;
}

export interface VolumeInfo {
  target: number;
  actual: number;
  mute: boolean;
}

export interface Preset {
  id: number;
  itemName: string;
  source: string;
  location: string;
  sourceAccount?: string;
}

export interface ZoneInfo {
  master: string;
  members: { ip: string; mac: string }[];
}

export interface DiscoveredDevice {
  ip: string;
  deviceID?: string;
  name?: string;
  type?: string;
  mac?: string;
  softwareVersion?: string;
  serialNumber?: string;
  macAddresses?: string[];
  nowPlaying?: NowPlayingInfo | null;
  volume?: VolumeInfo | null;
  presets?: Preset[] | null;
}

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true
});

export function parseNowPlayingXml(xml: string | any): NowPlayingInfo | null {
  const np = typeof xml === 'string' ? parser.parse(xml)?.nowPlaying : xml?.nowPlaying || xml;
  if (!np) return null;

  return {
    source: np.source,
    sourceAccount: np.sourceAccount,
    track: np.track,
    artist: np.artist,
    album: np.album,
    stationName: np.stationName,
    art: typeof np.art === 'string' ? np.art : np.art?.['#text'],
    artStatus: np.art?.artImageStatus,
    playStatus: np.playStatus,
    description: np.description,
    itemName: np.ContentItem?.itemName,
    location: np.ContentItem?.location,
    isPresetable: np.ContentItem?.isPresetable === 'true' || np.ContentItem?.isPresetable === true
  };
}

export function parseVolumeXml(xml: string): VolumeInfo | null {
  const obj = parser.parse(xml);
  return extractVolume(obj);
}

function extractVolume(obj: any): VolumeInfo | null {
  const v = obj?.volume || obj?.volumeUpdated?.volume || obj?.updates?.volumeUpdated?.volume;
  if (!v) return null;

  return {
    target: Number.parseInt(v.targetvolume, 10),
    actual: Number.parseInt(v.actualvolume, 10),
    mute: v.muteenabled === 'true' || v.muteenabled === true
  };
}

export function parseUpdateXml(xml: string): SoundTouchUpdate | null {
  const obj = parser.parse(xml);
  const updates = obj?.updates;
  if (!updates) return null;

  const result: SoundTouchUpdate = {};

  if (updates.nowPlayingUpdated) {
    result.nowPlaying = parseNowPlayingXml(updates.nowPlayingUpdated);
  } else if (updates.nowPlaying) {
    result.nowPlaying = parseNowPlayingXml(updates.nowPlaying);
  }

  const vol = extractVolume(updates);
  if (vol) {
    result.volume = vol;
  }

  if (updates.presetsChanged) {
    result.presetsChanged = true;
  }

  return result;
}

export function isPresetActive(device: { nowPlaying?: NowPlayingInfo | null }, preset: Preset): boolean {
  if (!device.nowPlaying || !preset) return false;

  // Check if source and location match
  // Location can be the URL/Station identifier
  const np = device.nowPlaying;

  // Bose API often returns the same content for current playing and preset
  // if both source and location/itemName match.
  if (np.source === preset.source && (np.location === preset.location || np.itemName === preset.itemName)) {
    return true;
  }

  return false;
}
