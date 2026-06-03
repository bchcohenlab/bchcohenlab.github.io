// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Apex custom domain served from the root of GitHub Pages.
  // Do NOT set `base` — an apex Pages site serves from `/`, and setting
  // `base` to the repo name would 404 every asset.
  site: 'https://bchcohenlab.com',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});