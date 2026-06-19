/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { getVolume, setVolume } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ params }) => {
  const { ip } = params;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const volume = await getVolume(ip);
    return new Response(JSON.stringify({ volume }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'fetch volume failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};

export const POST: RequestHandler = async ({ params, request }) => {
  const { ip } = params;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const { volume } = await request.json();
    if (typeof volume !== 'number') {
      return new Response(JSON.stringify({ error: 'Volume must be a number' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    await setVolume(ip, volume);
    return new Response(null, { status: 204 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'set volume failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
