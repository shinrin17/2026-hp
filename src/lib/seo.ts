import { categoryLabels, siteInfo } from '../config/site.ts';
import { workHref } from './work-urls.ts';

export type StructuredData = Record<string, unknown>;
export type OpenGraph =
  | { type: 'website' }
  | { type: 'article'; publishedTime: string; tags: string[] }
  | { type: 'profile'; firstName: string; lastName: string };

export interface PageMetadata {
  title: string;
  description?: string;
  path: string;
  openGraph?: OpenGraph;
  structuredData?: StructuredData;
}

type WorkMetadata = {
  slug: string;
  title: string;
  summary: string;
  role: string;
  categories: (keyof typeof categoryLabels)[];
};

const personId = (site: URL) => new URL('/about/#person', site).href;

export function websiteData(site: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteInfo.name,
    url: site.href,
    author: { '@id': personId(site) },
  };
}

export function profileData(site: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: new URL('/about/', site).href,
    mainEntity: {
      '@type': 'Person',
      '@id': personId(site),
      name: siteInfo.personName,
      alternateName: ['RYOHTA MORIKAWA', 'M.RYOHTA'],
      jobTitle: ['フォトグラファー', '映像ディレクター'],
      url: site.href,
      sameAs: siteInfo.sameAs,
      image: new URL('/assets/images/about-portrait.jpeg', site).href,
    },
  };
}

export function workDescription(work: WorkMetadata) {
  const categories = work.categories.map((category) => categoryLabels[category]);
  return work.summary.trim() || `${work.title} — ${siteInfo.personName}${work.role ? `が${work.role}を担当した` : 'の'}作品紹介。カテゴリ：${categories.join(' / ')}。`;
}

export function workData(site: URL, work: WorkMetadata, images: { src: string }[]) {
  const url = new URL(workHref(work.slug), site).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: work.title,
    description: workDescription(work),
    url,
    image: images.map((image) => new URL(image.src, site).href),
    about: { '@type': 'CreativeWork', name: work.title, contributor: { '@id': personId(site) } },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'WORKS', item: new URL('/works/', site).href },
        { '@type': 'ListItem', position: 2, name: work.title, item: url },
      ],
    },
  };
}

export function collectionData(site: URL, works: Pick<WorkMetadata, 'slug' | 'title'>[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '作品一覧',
    url: new URL('/works/', site).href,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: works.length,
      itemListElement: works.map((work, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: work.title,
        url: new URL(workHref(work.slug), site).href,
      })),
    },
  };
}

// Prevent HTML's script parser from interpreting user-authored text as markup.
export function serializeStructuredData(data: StructuredData) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
