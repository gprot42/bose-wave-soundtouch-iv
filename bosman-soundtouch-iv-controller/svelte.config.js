/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';

const isMobileBuild = process.env.BUILD_TARGET === 'mobile';

export default {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess({
    typescript: true,
  }),

  kit: {
    adapter: isMobileBuild
      ? adapterStatic({
          pages: 'dist',
          assets: 'dist',
          fallback: 'index.html',
          strict: true
        })
      : adapterNode(),
    paths: {
      relative: false,
    },
    prerender: isMobileBuild
      ? {
          entries: ['*'],
          handleHttpError: ({ status }) => {
            if (status === 404) return;
          }
        }
      : undefined
  },
};
