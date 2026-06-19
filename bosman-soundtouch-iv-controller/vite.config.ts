/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import path from 'node:path';

import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      $routes: path.resolve('./src/routes'),
      $components: path.resolve('./src/lib/components'),
    },
  },
  server: {
    allowedHosts: ['localhost'],

    port: 5173,
    host: '127.0.0.1',
    hmr: {
      // for proxying from quarkus dev
      port: 5173,
      // for testing standalone
      // protocol: 'ws',
      host: '127.0.0.1',
    },
  },
});
