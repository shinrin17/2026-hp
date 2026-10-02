import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { parse } from 'parse5';
import sharp from 'sharp';
import { readWorks } from './work-files.mjs';
import { assertWorkSlugs } from './work-slugs.mjs';
import { getWorkThumbnail, getWorkHeroImage } from './work-thumbnails.mjs';
import { categoryLabels, featuredWorkIds, siteInfo } from '../src/config/site.ts';
import { workHref, imageHref } from '../src/lib/work-urls.ts';

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
assert.ok(featuredWorkIds.length > 0, 'トップの代表作を指定してください。');
assert.equal(new Set(featuredWorkIds).size, featuredWorkIds.length, 'トップの代表作が重複しています。');
const workPages = new Map(works.map((work) => [new URL(workHref(work.data.slug), origin).href, work]));
const socialImage = siteInfo.socialImage;
const socialImageUrl = new URL(socialImage.path, origin).href;
const socialMetadata = await sharp(join(root, socialImage.path)).metadata();
assert.equal(socialImage.type, `image/${socialMetadata.format}`, 'OGP画像の形式が設定と一致しません。');
assert.equal(socialImage.width, socialMetadata.width, 'OGP画像の幅が設定と一致しません。');
assert.equal(socialImage.height, socialMetadata.height, 'OGP画像の高さが設定と一致しません。');
const thumbnails = new Map(await Promise.all(works.map(async (work) =>
  [work.data.slug, await getWorkThumbnail(work.folder, work.data)],
)));
const heroImages = await Promise.all(featuredWorkIds.map(async (id) => {
  const work = works.find((work) => work.data.workId === id);
  assert.ok(work, `トップの代表作がありません: ${id}`);
  return getWorkHeroImage(work.folder, work.data);
}));
const expectedThumbnails = [...new Map([...thumbnails.values(), ...heroImages]
  .flatMap((image) => image.variants.map((variant) => [variant.src, variant]))).values()];
const thumbnailFiles = output.filter((file) => file.startsWith(join(root, 'assets', 'work-thumbnails') + '/'));
assert.deepEqual(thumbnailFiles.sort(), expectedThumbnails.map((variant) => join(root, variant.src)).sort(), 'サムネイルに不足・古い画像・下書きの画像があります。');
for (const variant of expectedThumbnails) {
  const metadata = await sharp(join(root, variant.src)).metadata();
  assert.equal(metadata.format, 'webp', `サムネイル形式: ${variant.src}`);
  assert.equal(metadata.width, variant.width, `サムネイル幅: ${variant.src}`);
  assert.equal(metadata.height, variant.height, `サムネイル高さ: ${variant.src}`);
}
const expectedImagePaths = new Set(works.flatMap((work) =>
  [work.data.slug, work.folder].flatMap((path) => work.data.images.map((image) => join(root, 'works', path, image.file))),
));
const publishedImages = output.filter((file) => file.startsWith(join(root, 'works') + '/') && !file.endsWith('.html'));
assert.deepEqual(publishedImages.sort(), [...expectedImagePaths].sort(), '作品画像の公開出力に不足・未登録ファイル・重複ルートがあります。');
const canonicalPaths = new Map([
  [join(root, 'index.html'), `${origin}/`],
  [join(root, 'about', 'index.html'), `${origin}/about/`],
  [join(root, 'works', 'index.html'), `${origin}/works/`],
  ...works.map((work) => [join(root, 'works', work.data.slug, 'index.html'), new URL(workHref(work.data.slug), origin).href]),
]);
assert.equal(html.length, canonicalPaths.size, '公開HTMLは正規ページだけにしてください。');
const documents = new Map(await Promise.all(html.map(async (path) => [path, elements(parse(await readFile(path, 'utf8')))])));
const heroNodes = documents.get(join(root, 'index.html'))
  .filter((node) => node.tagName === 'div' && attrs(node).class === 'hero-image')
  .map((node) => attrs(elements(node).find((child) => child.tagName === 'img')));
assert.equal(heroNodes.length, heroImages.length, 'トップのスライド枚数が一致しません。');
for (const [index, image] of heroNodes.entries()) {
  assert.equal(image.src, heroImages[index].src, 'トップは生成済みWebPを使用してください。');
  assert.equal(image.srcset, heroImages[index].srcset, 'トップのWebP候補が一致しません。');
  assert.ok(image.sizes, 'トップの画像サイズ指定がありません。');
  assert.equal(image.fetchpriority, index === 0 ? 'high' : 'low', '先頭のスライドを優先してください。');
}
let links = 0;
for (const [path, nodes] of documents) {
  const expectedCanonical = canonicalPaths.get(path);
  assert.ok(expectedCanonical, `想定外のページ: ${path}`);
  const base = new URL(expectedCanonical);
  assert.equal(nodes.filter((node) => node.tagName === 'h1').length, 1, `${path}: h1`);
  const canonicals = nodes.filter((node) => node.tagName === 'link' && attrs(node).rel === 'canonical');
  assert.equal(canonicals.length, 1, `${path}: canonical は1つ必要です。`);
  assert.equal(attrs(canonicals[0]).href, expectedCanonical, `${path}: canonical`);
  assert.equal(meta(nodes, 'http-equiv', 'refresh'), undefined, `${path}: 正規ページでの転送`);
  assert.ok(meta(nodes, 'name', 'description'), `${path}: description`);
  assert.equal(meta(nodes, 'property', 'og:url'), expectedCanonical, `${path}: og:url`);
  const title = nodes.find((node) => node.tagName === 'title').childNodes.map((node) => node.value ?? '').join('');
  assert.equal(meta(nodes, 'property', 'og:title'), title, `${path}: og:title`);
  assert.equal(meta(nodes, 'name', 'twitter:title'), title, `${path}: twitter:title`);
  assert.equal(meta(nodes, 'property', 'og:description'), meta(nodes, 'name', 'description'), `${path}: og:description`);
  assert.equal(meta(nodes, 'name', 'twitter:description'), meta(nodes, 'name', 'description'), `${path}: twitter:description`);
  for (const [property, expected] of Object.entries({
    'og:image': socialImageUrl,
    'og:image:secure_url': socialImageUrl,
    'og:image:type': socialImage.type,
    'og:image:width': String(socialImage.width),
    'og:image:height': String(socialImage.height),
    'og:image:alt': socialImage.alt,
  })) assert.equal(meta(nodes, 'property', property), expected, `${path}: ${property}`);
  assert.equal(meta(nodes, 'name', 'twitter:card'), 'summary', `${path}: twitter:card`);
  assert.equal(meta(nodes, 'name', 'twitter:image'), socialImageUrl, `${path}: twitter:image`);
  assert.equal(meta(nodes, 'name', 'twitter:image:alt'), socialImage.alt, `${path}: twitter:image:alt`);
  const work = workPages.get(expectedCanonical);
  assert.equal(meta(nodes, 'property', 'og:type'), work ? 'article' : base.pathname === '/about/' ? 'profile' : 'website', `${path}: og:type`);
  if (work) {
    assert.equal(meta(nodes, 'property', 'article:published_time'), work.data.publishedAt, `${path}: 掲載日時`);
    assert.equal(meta(nodes, 'property', 'article:author'), `${origin}/about/`, `${path}: 著者`);
    const tags = nodes.filter((node) => node.tagName === 'meta' && attrs(node).property === 'article:tag').map((node) => attrs(node).content);
    assert.deepEqual(tags, work.data.categories.map((category) => categoryLabels[category]), `${path}: カテゴリ`);
    const gallery = nodes.find((node) => attrs(node).class === 'gallery');
    assert.ok(gallery, `${path}: ギャラリーがありません。`);
    assert.deepEqual(elements(gallery).filter((node) => node.tagName === 'img').map((node) => attrs(node).src),
      work.data.images.map((image) => imageHref(work.data.slug, image.file)), `${path}: ギャラリーの画像順`);
  }
  const scripts = nodes.filter((node) => node.tagName === 'script' && attrs(node).type === 'application/ld+json');
  assert.equal(scripts.length, 1, `${path}: JSON-LD は1つ必要です。`);
  for (const script of scripts) {
    const data = JSON.parse(script.childNodes.map((node) => node.value ?? '').join(''));
    if (work) {
      assert.equal(data['@type'], 'WebPage', `${path}: 詳細のページ種別`);
      assert.equal(data.url, expectedCanonical, `${path}: JSON-LD URL`);
      assert.equal(data.description, meta(nodes, 'name', 'description'), `${path}: JSON-LD description`);
      assert.equal(data.breadcrumb.itemListElement.at(-1).item, expectedCanonical, `${path}: パンくずURL`);
      assert.deepEqual(data.image, work.data.images.map((image) => new URL(imageHref(work.data.slug, image.file), origin).href), `${path}: JSON-LDの作品画像`);
    } else if (expectedCanonical === `${origin}/works/`) {
      assert.equal(data['@type'], 'CollectionPage', `${path}: 一覧のページ種別`);
      assert.equal(data.url, expectedCanonical, `${path}: JSON-LD URL`);
      assert.equal(data.mainEntity.numberOfItems, works.length, `${path}: 一覧件数`);
      const cards = nodes.filter((node) => node.tagName === 'article' && attrs(node).class === 'work');
      for (const card of cards) {
        const thumbnail = thumbnails.get(attrs(card).id);
        const image = attrs(elements(card).find((node) => node.tagName === 'img'));
        assert.equal(image.src, thumbnail.src, `${path}: 一覧はWebPサムネイルを使用してください。`);
        assert.equal(image.srcset, thumbnail.srcset, `${path}: サムネイル候補が一致しません。`);
        assert.ok(image.sizes, `${path}: サムネイルの表示サイズがありません。`);
      }
      assert.deepEqual(data.mainEntity.itemListElement.map(({ position, name, url }) => ({ position, name, url })), cards.map((card, index) => {
        const link = attrs(elements(card).find((node) => node.tagName === 'a'));
        return { position: index + 1, name: link['aria-label'], url: new URL(link.href, origin).href };
      }), `${path}: JSON-LDと表示作品の順序・名前・URL`);
    } else {
      assert.equal(data['@type'], base.pathname === '/about/' ? 'ProfilePage' : 'WebSite', `${path}: ページ種別`);
      assert.equal(data.url, expectedCanonical, `${path}: JSON-LD URL`);
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
for (const path of canonicalPaths.keys()) assert.ok(documents.has(path), `ページがありません: ${path}`);
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
console.log(`${canonicalPaths.size}ページ、${works.length}作品、${links}内部参照、${expectedThumbnails.length} WebPサムネイル、全作品画像・構造化データ・サイトマップを検証しました。`);
