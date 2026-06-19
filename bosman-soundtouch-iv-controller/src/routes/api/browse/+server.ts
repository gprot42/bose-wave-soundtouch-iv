/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { boseBrowse } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ url }) => {
  const deviceIp = url.searchParams.get('deviceIp');
  const sourceAccount = url.searchParams.get('sourceAccount');
  const containerLocation = url.searchParams.get('containerLocation') || undefined;
  const startItem = url.searchParams.get('startItem');
  const numItems = url.searchParams.get('numItems');
  if (!deviceIp || !sourceAccount) return new Response(JSON.stringify({ error: 'deviceIp and sourceAccount are required' }), { status: 400 });
  try {
    const items = await boseBrowse(deviceIp, {
      source: 'STORED_MUSIC',
      sourceAccount,
      containerLocation,
      startItem: startItem ? Number.parseInt(startItem, 10) : undefined,
      numItems: numItems ? Number.parseInt(numItems, 10) : undefined
    });
    return new Response(JSON.stringify({ items }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Browse failed' }), { status: 500 });
  }
};
