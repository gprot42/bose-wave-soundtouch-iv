/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      conditions: ['browser'],
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['test/unit/**/*.{test,spec}.{js,ts,svelte}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          '**/types/**',
          '**/e2e/**',
          '**.config.**',
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.svelte-kit/**',
          'src/app.d.ts',
          'src/vite-env.d.ts',
        ],
        include: ['src/**/*.{js,ts,svelte}'],
      },
      setupFiles: ['./vitest.setup.js'],
    },
  })
);
