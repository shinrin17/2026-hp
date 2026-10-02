import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dev, preview } from 'astro';
import { parse } from 'parse5';
import sharp from 'sharp';
import { readWorks } from './work-files.mjs';
import { getWorkThumbnail, getWorkHeroImage } from './work-thumbnails.mjs';
import { featuredWorkIds } from '../src/config/site.ts';
import { workHref, imageHref } from '../src/lib/work-urls.ts';

const mode = process.argv[2];
assert.ok(['dev', 'preview'].includes(mode), '使い方: node scripts/verify-http.mjs dev|preview');
const works = (await readWorks(resolve('works'))).filter((work) => !work.data.draft);
const pages = ['/', '/works/', '/about/', ...works.map((work) => workHref(work.data.slug))];
const removedPages = ['/about.html', '/works.html', ...works
  .filter((work) => work.folder !== work.data.slug)
  .flatMap((work) => [`/works/${encodeURIComponent(work.folder)}/`, `/works/${encodeURIComponent(work.folder)}/index.html`])];
const sourceRoot = resolve(mode === 'preview' ? 'dist' : 'public');
const expectedImages = new Map();
const expectedThumbnails = new Map((await Promise.all(works.map(async (work) => {
  const getImage = featuredWorkIds.includes(work.data.workId) ? getWorkHeroImage : getWorkThumbnail;
  const thumbnail = await getImage(work.folder, work.data);
  return thumbnail.variants.map((variant) => [variant.src, variant]);
}))).flat());
for (const work of works) {
  for (const image of work.data.images) {
    expectedImages.set(decodeURIComponent(imageHref(work.data.slug, image.file)), resolve('works', work.folder, image.file));
  }
}
function elements(node) {
  return [node, ...(node.childNodes ?? []).flatMap(elements)];
}
function structuredImages(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'image' ? [item].flat() : structuredImages(item),
  );
}
const start = mode === 'dev' ? dev : preview;
const server = await start({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false },
  devToolbar: { enabled: false },
});
try {
  const port = mode === 'dev' ? server.address.port : server.port;
  const origin = `http://127.0.0.1:${port}`;
  // Astro dev also accepts .html aliases; only the static preview matches hosting.
  if (mode === 'preview') {
    for (const path of removedPages) {
      const response = await fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      assert.equal(response.status, 404, `${mode}: 廃止したページURLが配信されています ${path}`);
      await response.arrayBuffer();
    }
    console.log(`${mode}: 廃止した${removedPages.length}URLの404を検証しました。`);
  }
  const images = new Map();
  for (const path of pages) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${mode}: ページ取得失敗 ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/, `${mode}: HTMLではありません ${path}`);
    for (const node of elements(parse(await response.text()))) {
      const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
      const references = [];
      if (node.tagName === 'img' && attrs.src) references.push(attrs.src);
      if (node.tagName === 'img' && attrs.srcset) references.push(...attrs.srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]));
      if (node.tagName === 'meta' && attrs.property === 'og:image') references.push(attrs.content);
      if (node.tagName === 'script' && attrs.type === 'application/ld+json') {
        references.push(...structuredImages(JSON.parse(node.childNodes.map((child) => child.value ?? '').join(''))));
      }
      for (const reference of references) {
        const url = new URL(reference, new URL(path, origin));
        assert.ok([origin, 'https://m-ryohta.com'].includes(url.origin), `${mode}: 外部画像は検証できません ${reference}`);
        images.set(url.pathname + url.search, path);
      }
    }
  }
  const coveredImages = new Set();
  const coveredThumbnails = new Set();
  for (const [path, page] of images) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${mode}: ${page} の画像がリンク切れ ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /^image\//, `${mode}: 画像ではありません ${path}`);
    const decoded = decodeURIComponent(new URL(path, origin).pathname);
    const thumbnail = expectedThumbnails.get(decoded);
    if (thumbnail) {
      assert.match(response.headers.get('content-type') ?? '', /^image\/webp\b/, `${mode}: WebPではありません ${path}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const metadata = await sharp(buffer).metadata();
      assert.equal(metadata.format, 'webp', `${mode}: サムネイル形式 ${path}`);
      assert.equal(metadata.width, thumbnail.width, `${mode}: サムネイル幅 ${path}`);
      assert.equal(metadata.height, thumbnail.height, `${mode}: サムネイル高さ ${path}`);
      if (mode === 'preview') assert.deepEqual(buffer, await readFile(resolve('dist', `.${decoded}`)), `${mode}: サムネイルの内容 ${path}`);
      coveredThumbnails.add(decoded);
      continue;
    }
    const original = expectedImages.get(decoded);
    if (original) coveredImages.add(decoded);
    else assert.ok(decoded.startsWith('/assets/'), `${mode}: 作品画像はslug配下を参照してください ${path}`);
    const source = original ?? resolve(sourceRoot, `.${decoded}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(source), `${mode}: 画像の内容が一致しません ${path}`);
  }
  assert.equal(coveredImages.size, expectedImages.size, `${mode}: ページ内で参照されていない作品画像があります。`);
  assert.equal(coveredThumbnails.size, expectedThumbnails.size, `${mode}: サムネイル候補に不足があります。`);
  console.log(`${mode}: ${pages.length}ページ、${images.size}画像（全${expectedImages.size}作品画像・${coveredThumbnails.size} WebPサムネイル・共通画像・OGP・構造化データ）のHTTP配信を検証しました。`);
} finally {
  await server.stop();
}
