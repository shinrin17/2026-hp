export const workHref = (slug: string) => `/works/${slug}/`;

// Keep reserved characters in image filenames encoded, using the stable slug.
export const imageHref = (slug: string, file: string) =>
  `${workHref(slug)}${file.split('/').map(encodeURIComponent).join('/')}`;
