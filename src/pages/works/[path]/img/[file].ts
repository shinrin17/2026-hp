import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { getWorks, worksRoot, routeSegment } from '../../../../lib/works';

// Publish images at the stable slug URL and retain the original folder URLs.
// Copy only published gallery images; Markdown and crawl snapshots stay out of dist.
export const getStaticPaths: GetStaticPaths = async () => (await getWorks()).flatMap((work) =>
  [...new Set([work.data.slug, work.id])].flatMap((path) =>
    [...new Set(work.data.images.map((image) => image.file))].map((file) => ({
      params: { path: routeSegment(path), file: routeSegment(file.slice('img/'.length)) },
      props: { path: join(worksRoot, work.id, file) },
    })),
  ),
);

const types: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif' };
export const GET: APIRoute = async ({ props }) => new Response(new Uint8Array(await readFile(props.path)), {
  headers: { 'Content-Type': types[extname(props.path).toLowerCase()] },
});
