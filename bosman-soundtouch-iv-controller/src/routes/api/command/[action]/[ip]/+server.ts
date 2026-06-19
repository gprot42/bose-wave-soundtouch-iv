/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { pause, play, power, pressKey, stop } from '$lib/server/soundtouch';

const actions: Record<string, (ip: string) => Promise<void>> = {
  power,
  play,
  pause,
  stop
};

export const POST: RequestHandler = async ({ params }) => {
  const { action, ip } = params;

  if (!action || !ip) {
    return new Response(JSON.stringify({ error: 'action and ip are required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const actionFn = actions[action.toLowerCase()];

  try {
    if (actionFn) {
      await actionFn(ip);
    } else {
      await pressKey(ip, action.toUpperCase());
    }
    return new Response(null, { status: 204 });
  } catch (e: any) {
    console.error(`Command ${action} failed for ${ip}:`, e);
    const message = e?.message ?? `${action} command failed`;
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
};
