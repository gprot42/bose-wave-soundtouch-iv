/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { setMusicServiceAccount } from '$lib/server/soundtouch';

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json().catch(() => ({}));
  const deviceIp: string | undefined = data.deviceIp;
  const displayName: string | undefined = data.displayName;
  const userId: string | undefined = data.userId; // typically UDN (uuid) without 'uuid:'
  if (!deviceIp || !displayName || !userId) {
    return new Response(JSON.stringify({ error: 'deviceIp, displayName, userId are required' }), { status: 400 });
  }
  try {
    await setMusicServiceAccount(deviceIp, displayName, userId);
    return new Response(null, { status: 204 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Set account failed' }), { status: 500 });
  }
};
