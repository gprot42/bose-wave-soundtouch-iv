/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

import type { Config } from 'tailwindcss';
import { join } from 'node:path';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import flowbite from 'flowbite/plugin';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{html,js,svelte,ts}',
    // Include Flowbite Svelte component library
    join(require.resolve('flowbite-svelte'), '../**/*.{html,js,svelte,ts}'),
  ],
  theme: {
    extend: {
      colors: {
        // custom colors can be defined here
      },
      fontFamily: {
        // custom fonts can be defined here
      },
    },
  },
  plugins: [forms, typography, flowbite],
} satisfies Config;
