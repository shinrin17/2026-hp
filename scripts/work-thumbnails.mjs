import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { workImagePath, imageDimensions } from './work-images.mjs';

const widths = [400, 800, 1200];
const webpOptions = { quality: 88, effort: 4 };
// Decode before the final resize to avoid JPEG shrink-on-load rounding the ratio.
const resizeOptions = { withoutEnlargement: true, fastShrinkOnLoad: false };
// Include the processing policy in URLs so a quality change invalidates caches too.
const recipe = JSON.stringify({ version: 1, widths, webpOptions, resizeOptions });

async function responsiveWorkImage(folder, data, root, candidateWidths, defaultWidth) {
  const image = data.images[0];
  if (!image) throw new Error(`${folder}/index.md: サムネイルの元画像がありません。`);
  const sourcePath = workImagePath(root, folder, image.file);
  const original = await readFile(sourcePath);
  const { width, height } = imageDimensions(await sharp(original).metadata(), sourcePath);
  const hash = createHash('sha256').update(recipe).update(original).digest('hex').slice(0, 16);
  const variants = [...new Set(candidateWidths.map((size) => Math.min(size, width)))].map((size) => {
    const file = `${hash}-${size}.webp`;
    return {
      file,
      src: `/assets/work-thumbnails/${data.slug}/${file}`,
      width: size,
      height: Math.max(1, Math.round(height * size / width)),
    };
  });
  return {
    sourcePath,
    width,
    height,
    alt: image.alt ?? `${data.title} — 1`,
    variants,
    src: (variants.find((variant) => variant.width >= defaultWidth) ?? variants.at(-1)).src,
    srcset: variants.map((variant) => `${variant.src} ${variant.width}w`).join(', '),
  };
}

export function getWorkThumbnail(folder, data, root = resolve('works')) {
  return responsiveWorkImage(folder, data, root, widths, 800);
}

export function getWorkHeroImage(folder, data, root = resolve('works')) {
  // Reuse list URLs, adding enough pixels for the 840px hero at 2x / 3x density.
  return responsiveWorkImage(folder, data, root, [...widths, 1680, 2520], 1200);
}

export async function renderWorkThumbnail(sourcePath, width) {
  // Keep composition, apply EXIF orientation, and never enlarge a source image.
  return sharp(sourcePath).rotate().resize({ width, ...resizeOptions }).webp(webpOptions).toBuffer();
}
