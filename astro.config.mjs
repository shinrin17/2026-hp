import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { preserveWorkPaths } from './scripts/astro-work-paths.mjs';

export default defineConfig({
  site: 'https://m-ryohta.com',
  output: 'static',
  // Directory output, canonical URLs and internal links keep page URLs ending
  // in /. Do not force a slash onto the dynamic image endpoint's [file] URLs.
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [preserveWorkPaths()],
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
});
