/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { getPresets, storePreset } from '$lib/server/soundtouch';

export const GET: RequestHandler = async ({ params }) => {
  const { ip } = params;
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const presets = await getPresets(ip);
    return new Response(JSON.stringify({ presets }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'fetch presets failed' }), {
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
    const { id, item } = await request.json();
    if (id === undefined || !item) {
      return new Response(JSON.stringify({ error: 'id and item are required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    await storePreset(ip, id, item);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    console.error(`POST /api/presets/${ip} failed:`, e);
    return new Response(JSON.stringify({ error: e?.message ?? 'store preset failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
