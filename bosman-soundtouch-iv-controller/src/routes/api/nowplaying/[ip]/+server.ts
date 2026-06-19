/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { getNowPlaying } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ params }) => {
  const { ip } = params;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const nowPlaying = await getNowPlaying(ip);
    return new Response(JSON.stringify({ nowPlaying }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'fetch nowplaying failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
