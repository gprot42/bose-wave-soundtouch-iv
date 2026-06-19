/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { discoverDevices } from '$lib/server/soundtouch';

export const GET: RequestHandler = async () => {
  try {
    const devices = await discoverDevices(2000);
    return new Response(JSON.stringify({ devices }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'discovery failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
