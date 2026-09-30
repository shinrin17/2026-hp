import type { APIRoute } from 'astro';
import { getWorks, workHref } from '../lib/works';

export const GET: APIRoute = async ({ site }) => {
  const paths = ['/', '/about/', '/works/', ...(await getWorks()).map((work) => workHref(work.data.slug))];
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${escape(new URL(path, site!).href)}</loc></url>`).join('\n')}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
