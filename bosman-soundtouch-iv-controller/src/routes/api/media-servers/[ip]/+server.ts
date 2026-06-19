/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { listMediaServers } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ params }) => {
  const ip = params.ip;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'ip is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  try {
    const servers = await listMediaServers(ip);
    return new Response(JSON.stringify({ servers }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    const message = e?.message ?? 'media server discovery failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
};
