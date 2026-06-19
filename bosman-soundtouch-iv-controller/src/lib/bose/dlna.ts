/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { XMLParser } from 'fast-xml-parser';
import { Capacitor } from '@capacitor/core';
import { nativeHttpGet, nativeHttpPost } from '$lib/native/wifiInfo';
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true
});

export type MediaServer = {
  id: string; // use UDN without 'uuid:'
  friendlyName: string;
  location: string; // LOCATION header of device description
};

export async function getMediaServerDescription(location: string) {
  let xml = '';
  if (Capacitor.isNativePlatform()) {
    const res = await nativeHttpGet(location, 4000);
    if (!res?.ok || !res.body) throw new Error(`Failed to fetch device description: ${res?.status || 0}`);
    xml = res.body;
  } else {
    const res = await fetch(location);
    if (!res.ok) throw new Error(`Failed to fetch device description: ${res.status}`);
    xml = await res.text();
  }
  const obj = parser.parse(xml);
  const device = obj?.root?.device || obj?.device;

  const findService = (services: any, type: string) => {
    if (!services?.service) return null;
    const list = Array.isArray(services.service) ? services.service : [services.service];
    return list.find((s: any) => s.serviceType?.includes(type));
  };

  const contentDirectory = findService(device?.serviceList, 'ContentDirectory');
  const controlUrl = contentDirectory?.controlURL || '';

  const url = new URL(location);
  return {
    udn: (device?.UDN || '').replace(/^uuid:/i, ''),
    friendlyName: device?.friendlyName || '',
    controlUrl: controlUrl,
    baseUrl: `${url.protocol}//${url.host}`
  };
}

export async function browseMediaServer(baseUrl: string, controlUrl: string, objectId = '0') {
  const url = `${baseUrl}${controlUrl}`;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${objectId}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>0</StartingIndex>
      <RequestedCount>200</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>`;

  let xml = '';
  if (Capacitor.isNativePlatform()) {
    const res = await nativeHttpPost(
      url,
      body,
      'text/xml; charset="utf-8"',
      8000,
      '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
    );
    if (!res?.ok || !res.body) {
      throw new Error(`Browse failed: ${res?.status || 0} ${res?.error || res?.body || ''}`);
    }
    xml = res.body;
  } else {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"'
      },
      body
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Browse failed: ${res.status} ${errorText}`);
    }

    xml = await res.text();
  }
  return parseSoapBrowseResponse(xml);
}

function parseSoapBrowseResponse(xml: string) {
  const obj = parser.parse(xml);
  const resultEncoded = obj?.Envelope?.Body?.BrowseResponse?.Result || obj?.Body?.BrowseResponse?.Result;
  if (!resultEncoded) return [];

  const resultXml = parser.parse(resultEncoded);
  const root = resultXml?.['DIDL-Lite'] || resultXml;
  const items: any[] = [];

  const containers = root?.container ? (Array.isArray(root.container) ? root.container : [root.container]) : [];
  for (const c of containers) {
    items.push({
      type: 'container',
      title: c.title || 'Unknown',
      id: c.id || '',
      objectId: c.id || '',
      childCount: c.childCount ? Number.parseInt(c.childCount, 10) : undefined
    });
  }

  const rawItems = root?.item ? (Array.isArray(root.item) ? root.item : [root.item]) : [];
  for (const i of rawItems) {
    items.push({
      type: 'item',
      title: i.title || 'Unknown',
      id: i.id || '',
      location: i.res,
      objectId: i.id || ''
    });
  }

  return items;
}

export type UpnpDeviceKind = 'server' | 'renderer' | 'other';

export function parseDeviceDescription(xml: string): {
  udn?: string;
  friendlyName?: string;
  isMediaServer: boolean;
  kind: UpnpDeviceKind;
} {
  const obj = parser.parse(xml);
  const device = obj?.root?.device || obj?.device;
  const udn = device?.UDN || device?.udn;
  const friendlyName = device?.friendlyName || device?.modelName || 'UPnP Device';

  // A media server exposes a ContentDirectory service we can browse.
  const isMediaServer =
    /urn:schemas-upnp-org:device:MediaServer:\d+/i.test(xml) ||
    /urn:schemas-upnp-org:service:ContentDirectory:\d+/i.test(xml);
  // A renderer plays media pushed to it (e.g. the Bose SoundTouch, smart TVs).
  const isRenderer =
    /urn:schemas-upnp-org:device:MediaRenderer:\d+/i.test(xml) ||
    /urn:schemas-upnp-org:service:AVTransport:\d+/i.test(xml);
  const kind: UpnpDeviceKind = isMediaServer ? 'server' : isRenderer ? 'renderer' : 'other';

  return { udn: (udn || '').replace(/^uuid:/i, ''), friendlyName, isMediaServer, kind };
}
