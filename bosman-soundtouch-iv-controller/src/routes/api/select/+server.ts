/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { boseSelectStoredMusic } from '$lib/server/soundtouch';

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json().catch(() => ({}));
  const deviceIp: string | undefined = data.deviceIp;
  const sourceAccount: string | undefined = data.sourceAccount;
  const location: string | undefined = data.location;
  const itemName: string | undefined = data.itemName;
  if (!deviceIp || !sourceAccount || !location || !itemName) {
    return new Response(JSON.stringify({ error: 'deviceIp, sourceAccount, location, itemName are required' }), { status: 400 });
  }
  try {
    await boseSelectStoredMusic(deviceIp, { sourceAccount, location, itemName });
    return new Response(null, { status: 204 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Select failed' }), { status: 500 });
  }
};
