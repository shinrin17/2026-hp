import { dirname, resolve } from 'node:path';

export function workImagePath(root, folder, file) {
  const path = resolve(root, folder, file);
  if (dirname(path) !== resolve(root, folder, 'img')) throw new Error(`Invalid image: ${path}`);
  return path;
}

export function imageDimensions(metadata, sourcePath) {
  if (!metadata.width || !metadata.height) throw new Error(`Image size unavailable: ${sourcePath}`);
  const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}
