import type { APIRoute, GetStaticPaths } from 'astro';
import { getWorks } from '../../../../lib/works';
import { getWorkThumbnail, getWorkHeroImage, renderWorkThumbnail } from '../../../../../scripts/work-thumbnails.mjs';
import { featuredWorkIds } from '../../../../config/site';

// Both manual works and Instagram imports enter through the published Markdown.
// Astro generates these files on build and serves them on demand in development.
export const getStaticPaths: GetStaticPaths = async () => {
  const works = await getWorks();
  const paths = await Promise.all(works.map(async (work) => {
    const getImage = featuredWorkIds.includes(work.data.workId) ? getWorkHeroImage : getWorkThumbnail;
    const thumbnail = await getImage(work.id, work.data);
    return thumbnail.variants.map((variant) => ({
      params: { slug: work.data.slug, file: variant.file },
      props: { sourcePath: thumbnail.sourcePath, width: variant.width },
    }));
  }));
  return paths.flat();
};

export const GET: APIRoute = async ({ props }) => new Response(
  new Uint8Array(await renderWorkThumbnail(props.sourcePath, props.width)),
  { headers: { 'Content-Type': 'image/webp' } },
);
