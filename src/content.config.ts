import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { workFolders } from './lib/work-loader';
import { slugPattern } from '../scripts/work-slugs.mjs';

const works = defineCollection({
  loader: workFolders(),
  schema: z.object({
    workId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    // A blank slug is only allowed while drafting. getWorks validates publication.
    slug: z.union([z.string().regex(slugPattern).max(64), z.literal('')]),
    title: z.string().min(1),
    categories: z.array(z.enum(['photo', 'movie', 'production-staff'])).min(1),
    publishedAt: z.iso.datetime({ offset: true }),
    draft: z.boolean().default(false),
    summary: z.string().default(''),
    role: z.string().default(''),
    client: z.string().default(''),
    source: z.url({ protocol: /^https?$/ }).optional(),
    sourceLabel: z.string().optional(),
    images: z.array(z.object({
      file: z.string().regex(/^img\/[^/\\]+\.(?:jpg|jpeg|png|webp|avif)$/i),
      alt: z.string().optional(),
      caption: z.string().optional(),
    })).default([]),
  }),
});

export const collections = { works };
