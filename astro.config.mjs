import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { preserveWorkPaths } from './scripts/astro-work-paths.mjs';

export default defineConfig({
  site: 'https://m-ryohta.com',
  output: 'static',
  // Directory output, canonical URLs and internal links keep page URLs ending
  // in /. Do not force a slash onto the dynamic image endpoint's [file] URLs.
  trailingSlash: 'ignore',
  // Make the cross-document transition opt-in available before the first paint.
  // The small shared stylesheet is protected by Astro's generated CSP hash.
  build: { format: 'directory', inlineStylesheets: 'always' },
  security: {
    csp: {
      directives: [
        "default-src 'none'",
        "base-uri 'none'",
        "object-src 'none'",
        "form-action 'none'",
        "img-src 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", { resource: "'none'", kind: 'attribute' }],
      },
      styleDirective: {
        // Only style attributes need inline permission: photo ratios and layout.
        // Script/style elements retain Astro's generated content hashes.
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  integrations: [preserveWorkPaths()],
  markdown: { processor: satteri({ features: { smartPunctuation: false } }) },
});
