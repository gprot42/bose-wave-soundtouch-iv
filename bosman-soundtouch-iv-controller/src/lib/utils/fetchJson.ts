/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const contentType = res.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const text = await res.text();
    const preview = text.trim().slice(0, 80);
    if (preview.startsWith('<!') || preview.startsWith('<!--')) {
      throw new Error(
        'API server unavailable. Start the app with "npm run dev" or "npm run build && npm start".'
      );
    }
    throw new Error(
      res.ok
        ? `Server returned non-JSON response (${contentType || 'unknown'}): ${preview}`
        : `Request failed (${res.status}): ${preview}`
    );
  }

  const data = (await res.json()) as T;
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}