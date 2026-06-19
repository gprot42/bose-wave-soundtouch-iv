/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { discoverMediaServers } from '$lib/server/dlna';

export const GET: RequestHandler = async () => {
  try {
    const servers = await discoverMediaServers();
    return new Response(JSON.stringify({ servers }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'DLNA Discovery failed' }), { status: 500 });
  }
};
