/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import SSDP from 'node-ssdp';
import type { MediaServer } from '$lib/bose/dlna';
import { parseDeviceDescription } from '$lib/bose/dlna';

export * from '$lib/bose/dlna';

const { Client: SSDPClient } = SSDP;

export async function discoverMediaServers(timeoutMs = 5500): Promise<MediaServer[]> {
  const client = new SSDPClient({ explicitSocketBind: true });
  const locations = new Set<string>();

  const onResponse = (headers: any) => {
    const loc = headers?.LOCATION || headers?.Location || headers?.location;
    if (loc && typeof loc === 'string') locations.add(loc);
  };

  client.on('response', onResponse);
  try {
    client.search('urn:schemas-upnp-org:device:MediaServer:1');
    client.search('urn:schemas-upnp-org:service:ContentDirectory:1');
    client.search('upnp:rootdevice');
    client.search('ssdp:all');
    await new Promise((r) => setTimeout(r, timeoutMs));
  } finally {
    client.removeListener('response', onResponse);
    try { client.stop(); } catch {}
  }

  const results: MediaServer[] = [];
  await Promise.all(
    Array.from(locations).map(async (loc) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(loc, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return;
        const xml = await res.text();
        const meta = parseDeviceDescription(xml);
        if (meta.isMediaServer && meta.udn) {
          results.push({ id: meta.udn, friendlyName: meta.friendlyName || 'Media Server', location: loc });
        }
      } catch {
        // ignore unreachable hosts
      }
    })
  );

  const byId = new Map<string, MediaServer>();
  for (const server of results) if (!byId.has(server.id)) byId.set(server.id, server);
  return Array.from(byId.values());
}