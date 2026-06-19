/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

/**** @type {import('tailwindcss').Config} ****/
module.exports = {
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './node_modules/flowbite-svelte/**/*.{html,js,svelte,ts}',
    './node_modules/flowbite/**/*.js'
  ],
  theme: {
    extend: {},
  },
  plugins: [require('flowbite/plugin')],
};
