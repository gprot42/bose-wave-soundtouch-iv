/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import SSDP from 'node-ssdp';
import type { DiscoveredDevice } from '$lib/utils/boseShared';
import { fetchInfo } from '$lib/bose/soundtouch';

export * from '$lib/bose/soundtouch';

const { Client: SSDPClient } = SSDP;

function extractIpFromLocation(location: string): string | null {
  try {
    return new URL(location).hostname;
  } catch {
    return null;
  }
}

export async function discoverDevices(timeoutMs = 2000, fetchTimeoutMs = 1500): Promise<DiscoveredDevice[]> {
  const client = new SSDPClient({ explicitSocketBind: true });
  const locations = new Set<string>();
  // Track when the last *new* location arrived so we can settle early
  let lastNewAt = 0;
  const SETTLE_MS = 500; // stop if no new device seen for this long

  const onResponse = (headers: any) => {
    const loc = headers?.LOCATION || headers?.Location || headers?.location;
    if (loc && typeof loc === 'string' && !locations.has(loc)) {
      locations.add(loc);
      lastNewAt = Date.now();
    }
  };

  client.on('response', onResponse);

  try {
    client.search('urn:schemas-upnp-org:device:MediaRenderer:1');
    client.search('urn:schemas-upnp-org:service:RenderingControl:1');
    client.search('ssdp:all');

    // Resolve at deadline OR as soon as responses have settled
    await new Promise<void>((resolve) => {
      const deadline = setTimeout(resolve, timeoutMs);
      const poll = setInterval(() => {
        if (lastNewAt > 0 && Date.now() - lastNewAt >= SETTLE_MS) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolve();
        }
      }, 100);
      // Ensure the interval is also cleared on deadline
      setTimeout(() => clearInterval(poll), timeoutMs + 50);
    });
  } finally {
    client.removeListener('response', onResponse);
    try { client.stop(); } catch {}
  }

  const ips = Array.from(new Set(
    Array.from(locations).map(extractIpFromLocation).filter((ip): ip is string => !!ip)
  ));

  const devices: DiscoveredDevice[] = [];
  await Promise.all(
    ips.map(async (ip) => {
      const meta = await fetchInfo(ip, fetchTimeoutMs);
      if (meta?.name || meta?.deviceID) devices.push({ ip, ...meta } as DiscoveredDevice);
    })
  );

  return devices;
}