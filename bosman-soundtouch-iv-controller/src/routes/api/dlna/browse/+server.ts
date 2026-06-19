/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { browseMediaServer, getMediaServerDescription } from '$lib/server/dlna';

export const GET: RequestHandler = async ({ url }) => {
  const location = url.searchParams.get('location');
  const baseUrl = url.searchParams.get('baseUrl');
  const controlUrl = url.searchParams.get('controlUrl');
  const objectId = url.searchParams.get('objectId') || '0';

  try {
    let effectiveBaseUrl = baseUrl;
    let effectiveControlUrl = controlUrl;

    if (location && (!baseUrl || !controlUrl)) {
      const desc = await getMediaServerDescription(location);
      effectiveBaseUrl = desc.baseUrl;
      effectiveControlUrl = desc.controlUrl;
    }

    if (!effectiveBaseUrl || !effectiveControlUrl) {
      return new Response(JSON.stringify({ error: 'Missing baseUrl or controlUrl' }), { status: 400 });
    }

    const items = await browseMediaServer(effectiveBaseUrl, effectiveControlUrl, objectId);
    return new Response(JSON.stringify({ items, baseUrl: effectiveBaseUrl, controlUrl: effectiveControlUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'DLNA Browse failed' }), { status: 500 });
  }
};
