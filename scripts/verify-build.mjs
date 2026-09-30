import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { parse } from 'parse5';
import { readWorks } from './work-files.mjs';
import { assertWorkSlugs } from './work-slugs.mjs';

const root = resolve('dist');
const origin = 'https://m-ryohta.com';
async function files(path) {
  return (await Promise.all((await readdir(path, { withFileTypes: true })).map((entry) => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]))).flat();
}
function elements(node) {
  return [node, ...(node.childNodes ?? []).flatMap(elements)];
}
const attrs = (node) => Object.fromEntries((node?.attrs ?? []).map(({ name, value }) => [name, value]));
const meta = (nodes, key, value) => attrs(nodes.find((node) => node.tagName === 'meta' && attrs(node)[key] === value)).content;
const output = await files(root);
assert.ok(!output.some((file) => ['.md', '.json'].includes(extname(file))), '編集データ・取得記録が公開出力に含まれています。');
const html = output.filter((file) => file.endsWith('.html'));
const allWorks = await readWorks(resolve('works'));
assertWorkSlugs(allWorks);
const works = allWorks.filter((work) => !work.data.draft);
const expectedImagePaths = new Set(works.flatMap((work) =>
  [work.data.slug, work.folder].flatMap((path) => work.data.images.map((image) => join(root, 'works', path, image.file))),
));
const publishedImages = output.filter((file) => file.startsWith(join(root, 'works') + '/') && !file.endsWith('.html'));
assert.deepEqual(publishedImages.sort(), [...expectedImagePaths].sort(), '作品画像の公開出力に不足・未登録ファイル・重複ルートがあります。');
const canonicalPaths = new Map([
  [join(root, 'index.html'), `${origin}/`],
  [join(root, 'about', 'index.html'), `${origin}/about/`],
  [join(root, 'works', 'index.html'), `${origin}/works/`],
  ...works.map((work) => [join(root, 'works', work.data.slug, 'index.html'), `${origin}/works/${work.data.slug}/`]),
]);
const redirectPaths = new Map([
  [join(root, 'about.html'), '/about/'],
  [join(root, 'works.html'), '/works/'],
  ...works.filter((work) => work.folder !== work.data.slug).map((work) => [
    join(root, 'works', work.folder, 'index.html'), `/works/${work.data.slug}/`,
  ]),
]);
assert.equal(html.length, canonicalPaths.size + redirectPaths.size, 'ページ数が一致しません。');
const documents = new Map(await Promise.all(html.map(async (path) => [path, elements(parse(await readFile(path, 'utf8')))])));
let links = 0;
for (const [path, nodes] of documents) {
  const relative = path.slice(root.length).split('/').map(encodeURIComponent).join('/');
  const base = new URL(canonicalPaths.get(path) ?? relative, origin);
  const redirect = redirectPaths.get(path);
  const expectedCanonical = redirect ? new URL(redirect, origin).href : canonicalPaths.get(path);
  assert.ok(expectedCanonical, `想定外のページ: ${path}`);
  assert.equal(nodes.filter((node) => node.tagName === 'h1').length, 1, `${path}: h1`);
  const canonicals = nodes.filter((node) => node.tagName === 'link' && attrs(node).rel === 'canonical');
  assert.equal(canonicals.length, 1, `${path}: canonical は1つ必要です。`);
  assert.equal(attrs(canonicals[0]).href, expectedCanonical, `${path}: canonical`);
  if (redirect) {
    assert.equal(meta(nodes, 'http-equiv', 'refresh'), `0;url=${redirect}`, `${path}: 旧URLの転送先`);
    assert.ok(nodes.some((node) => node.tagName === 'a' && attrs(node).href === redirect), `${path}: 転送先リンク`);
    const target = join(root, redirect, 'index.html');
    assert.ok(canonicalPaths.has(target), `${path}: 転送先は正規ページであること`);
    assert.ok(!meta(nodes, 'name', 'robots')?.includes('noindex'), `${path}: 移転の処理を妨げるnoindex`);
  } else {
    assert.equal(meta(nodes, 'http-equiv', 'refresh'), undefined, `${path}: 正規ページでの転送`);
    assert.ok(meta(nodes, 'name', 'description'), `${path}: description`);
    assert.equal(meta(nodes, 'property', 'og:url'), expectedCanonical, `${path}: og:url`);
    const title = nodes.find((node) => node.tagName === 'title').childNodes.map((node) => node.value ?? '').join('');
    assert.equal(meta(nodes, 'property', 'og:title'), title, `${path}: og:title`);
    assert.equal(meta(nodes, 'name', 'twitter:title'), title, `${path}: twitter:title`);
    assert.equal(meta(nodes, 'property', 'og:description'), meta(nodes, 'name', 'description'), `${path}: og:description`);
    assert.equal(meta(nodes, 'name', 'twitter:description'), meta(nodes, 'name', 'description'), `${path}: twitter:description`);
    const scripts = nodes.filter((node) => node.tagName === 'script' && attrs(node).type === 'application/ld+json');
    assert.equal(scripts.length, 1, `${path}: JSON-LD は1つ必要です。`);
    for (const script of scripts) {
      const data = JSON.parse(script.childNodes.map((node) => node.value ?? '').join(''));
      if (expectedCanonical.startsWith(`${origin}/works/`) && expectedCanonical !== `${origin}/works/`) {
        assert.equal(data.url, expectedCanonical, `${path}: JSON-LD URL`);
        assert.equal(data.description, meta(nodes, 'name', 'description'), `${path}: JSON-LD description`);
        assert.equal(data.breadcrumb.itemListElement.at(-1).item, expectedCanonical, `${path}: パンくずURL`);
      } else if (expectedCanonical === `${origin}/works/`) {
        assert.equal(data['@type'], 'CollectionPage', `${path}: 一覧のページ種別`);
        assert.equal(data.url, expectedCanonical, `${path}: JSON-LD URL`);
        assert.equal(data.mainEntity.numberOfItems, works.length, `${path}: 一覧件数`);
        const cards = nodes.filter((node) => node.tagName === 'article' && attrs(node).class === 'work');
        assert.deepEqual(data.mainEntity.itemListElement.map(({ position, name, url }) => ({ position, name, url })), cards.map((card, index) => {
          const link = attrs(elements(card).find((node) => node.tagName === 'a'));
          return { position: index + 1, name: link['aria-label'], url: new URL(link.href, origin).href };
        }), `${path}: JSON-LDと表示作品の順序・名前・URL`);
      }
    }
  }
  for (const node of nodes) {
    const data = attrs(node);
    if (node.tagName === 'img') assert.ok(Number(data.width) > 0 && Number(data.height) > 0 && 'alt' in data, `${path}: 画像属性`);
    const reference = data.src ?? (node.tagName === 'a' || node.tagName === 'link' ? data.href : undefined);
    if (!reference) continue;
    const url = new URL(reference, base);
    if (url.origin !== base.origin) continue;
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`, url.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok(target.startsWith(root + '/'), `公開フォルダ外: ${reference}`);
    assert.ok((await stat(target).catch(() => null))?.isFile(), `${path}: リンク切れ ${reference}`);
    if (documents.has(target)) {
      assert.equal(url.href.split('#')[0], canonicalPaths.get(target), `${path}: ページリンクは末尾 / の正規URLを使ってください ${reference}`);
    }
    if (url.hash && documents.has(target)) assert.ok(documents.get(target).some((element) => attrs(element).id === decodeURIComponent(url.hash.slice(1))), `${path}: アンカー不明 ${reference}`);
    links++;
  }
}
for (const path of [...canonicalPaths.keys(), ...redirectPaths.keys()]) assert.ok(documents.has(path), `ページがありません: ${path}`);
for (const work of works) {
  for (const image of work.data.images) {
    for (const path of new Set([work.data.slug, work.folder])) {
      assert.deepEqual(await readFile(join(root, 'works', path, image.file)), await readFile(join('works', work.folder, image.file)), `画像が一致しません: ${path}/${image.file}`);
    }
  }
}
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(sitemapUrls.sort(), [...canonicalPaths.values()].sort(), 'サイトマップは正規URLだけを含めてください。');
assert.match(await readFile(join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/m-ryohta.com\/sitemap.xml/);
assert.equal((await readFile(join(root, 'CNAME'), 'utf8')).trim(), 'm-ryohta.com');
console.log(`${canonicalPaths.size}ページ、${works.length}作品、旧URL転送${redirectPaths.size}件、${links}内部参照、全作品画像・構造化データ・サイトマップを検証しました。`);
