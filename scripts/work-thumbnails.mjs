import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const widths = [400, 800, 1200];
const webpOptions = { quality: 88, effort: 4 };
// Decode before the final resize to avoid JPEG shrink-on-load rounding the ratio.
const resizeOptions = { withoutEnlargement: true, fastShrinkOnLoad: false };
// Include the processing policy in URLs so a quality change invalidates caches too.
const recipe = JSON.stringify({ version: 1, widths, webpOptions, resizeOptions });

export async function getWorkThumbnail(folder, data, root = resolve('works')) {
  const image = data.images[0];
  if (!image) throw new Error(`${folder}/index.md: サムネイルの元画像がありません。`);
  const sourcePath = resolve(root, folder, image.file);
  if (dirname(sourcePath) !== resolve(root, folder, 'img')) throw new Error(`Invalid image: ${sourcePath}`);
  const original = await readFile(sourcePath);
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Image size unavailable: ${sourcePath}`);
  const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  const hash = createHash('sha256').update(recipe).update(original).digest('hex').slice(0, 16);
  const variants = [...new Set(widths.map((size) => Math.min(size, width)))].map((size) => {
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
    src: variants[Math.min(1, variants.length - 1)].src,
    srcset: variants.map((variant) => `${variant.src} ${variant.width}w`).join(', '),
  };
}

export async function renderWorkThumbnail(sourcePath, width) {
  // Keep composition, apply EXIF orientation, and never enlarge a source image.
  return sharp(sourcePath).rotate().resize({ width, ...resizeOptions }).webp(webpOptions).toBuffer();
}
