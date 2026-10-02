import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dev, preview } from 'astro';
import { parse } from 'parse5';
import { readWorks } from './work-files.mjs';

const mode = process.argv[2];
assert.ok(['dev', 'preview'].includes(mode), '使い方: node scripts/verify-http.mjs dev|preview');
const works = (await readWorks(resolve('works'))).filter((work) => !work.data.draft);
const pages = ['/', '/works/', '/about/', ...works.map((work) => `/works/${work.data.slug}/`)];
const sourceRoot = resolve(mode === 'preview' ? 'dist' : 'public');
const expectedImages = new Map();
for (const work of works) {
  for (const image of work.data.images) {
    expectedImages.set(`/works/${work.data.slug}/${image.file}`, resolve('works', work.folder, image.file));
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
  const verificationFile = 'googleb12b508bf6084b36.html';
  const verificationResponse = await fetch(new URL(`/${verificationFile}`, origin), {
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
  });
  assert.equal(verificationResponse.status, 200, `${mode}: Search Console確認ファイル取得失敗`);
  assert.deepEqual(Buffer.from(await verificationResponse.arrayBuffer()), await readFile(resolve('public', verificationFile)), `${mode}: Search Console確認ファイルが一致しません。`);
  const images = new Map();
  for (const path of pages) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${mode}: ページ取得失敗 ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/, `${mode}: HTMLではありません ${path}`);
    for (const node of elements(parse(await response.text()))) {
      const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
      const references = [];
      if (node.tagName === 'img' && attrs.src) references.push(attrs.src);
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
  for (const [path, page] of images) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${mode}: ${page} の画像がリンク切れ ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /^image\//, `${mode}: 画像ではありません ${path}`);
    const decoded = decodeURIComponent(new URL(path, origin).pathname);
    const original = expectedImages.get(decoded);
    if (original) coveredImages.add(decoded);
    else assert.ok(decoded.startsWith('/assets/'), `${mode}: 作品画像はslug配下を参照してください ${path}`);
    const source = original ?? resolve(sourceRoot, `.${decoded}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(source), `${mode}: 画像の内容が一致しません ${path}`);
  }
  assert.equal(coveredImages.size, expectedImages.size, `${mode}: ページ内で参照されていない作品画像があります。`);
  console.log(`${mode}: ${pages.length}ページ、${images.size}画像（全${expectedImages.size}作品画像・共通画像・OGP・構造化データ）のHTTP配信を検証しました。`);
} finally {
  await server.stop();
}
