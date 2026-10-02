import { getCollection, type CollectionEntry } from 'astro:content';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { assertWorkSlugs } from '../../scripts/work-slugs.mjs';
import { workImagePath, imageDimensions } from '../../scripts/work-images.mjs';
import { imageHref } from './work-urls';
export { workHref, imageHref } from './work-urls';
export { routeSegment } from '../../scripts/work-files.mjs';

export const worksRoot = resolve('works');

export async function getWorks() {
  const entries = await getCollection('works');
  assertWorkSlugs(entries.map((entry) => ({ folder: entry.id, data: entry.data })));
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.data.workId)) throw new Error(`Duplicate workId: ${entry.data.workId}`);
    ids.add(entry.data.workId);
    if (!entry.data.draft && !entry.data.images.length) throw new Error(`${entry.id}/index.md: 公開作品には画像が必要です。`);
  }
  return entries.filter((entry) => !entry.data.draft).sort((a, b) =>
    Date.parse(b.data.publishedAt) - Date.parse(a.data.publishedAt) || a.data.workId.localeCompare(b.data.workId),
  );
}

async function getImage(entry: CollectionEntry<'works'>, index: number) {
  const image = entry.data.images[index];
  if (!image) throw new Error(`${entry.id}/index.md: 画像がありません。`);
  const path = workImagePath(worksRoot, entry.id, image.file);
  const dimensions = imageDimensions(await sharp(path).metadata(), path);
  return {
    ...image,
    src: imageHref(entry.data.slug, image.file),
    ...dimensions,
    alt: image.alt ?? `${entry.data.title} — ${index + 1}`,
  };
}

export function getImages(entry: CollectionEntry<'works'>) {
  return Promise.all(entry.data.images.map((_, index) => getImage(entry, index)));
}

export type WorkImage = Awaited<ReturnType<typeof getImages>>[number];
