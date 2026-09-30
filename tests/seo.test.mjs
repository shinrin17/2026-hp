import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { collectionData, profileData, serializeStructuredData, websiteData, workData, workDescription } from '../src/lib/seo.ts';
import { imageHref } from '../src/lib/work-urls.ts';

const site = new URL('https://portfolio.example/');
const work = { slug: 'fixed-slug', title: '作品 <試作> & 写真', summary: '', role: '', categories: ['photo', 'movie'] };

test('作品説明は記入済みの事実だけを使い、summaryを優先する', () => {
  assert.equal(workDescription(work), '作品 <試作> & 写真 — 森川亮太の作品紹介。カテゴリ：PHOTO / MOVIE。');
  assert.match(workDescription({ ...work, role: '編集', summary: '   ' }), /森川亮太が編集を担当した/);
  assert.equal(workDescription({ ...work, summary: '  公開用の作品紹介。  ' }), '公開用の作品紹介。');
});

test('作品名を変えても正規URL・画像URL・本人参照を維持する', () => {
  const src = imageHref(work.slug, 'img/撮影 #1&2.jpg');
  const data = workData(site, { ...work, title: '変更後の表示名' }, [{ src }]);
  assert.equal(data.url, 'https://portfolio.example/works/fixed-slug/');
  assert.equal(data.breadcrumb.itemListElement.at(-1).item, data.url);
  assert.equal(data.image[0], 'https://portfolio.example/works/fixed-slug/img/%E6%92%AE%E5%BD%B1%20%231%262.jpg');
  const person = profileData(site).mainEntity['@id'];
  assert.equal(data.about.contributor['@id'], person);
  assert.equal(websiteData(site).author['@id'], person);
});

test('一覧の構造化データは渡された公開作品の順序・URL・件数を保持する', () => {
  const data = collectionData(site, [work, { ...work, slug: 'second-work', title: '2作目' }]);
  assert.equal(data['@type'], 'CollectionPage');
  assert.equal(data.mainEntity.numberOfItems, 2);
  assert.deepEqual(data.mainEntity.itemListElement.map(({ position, url }) => [position, url]), [
    [1, 'https://portfolio.example/works/fixed-slug/'],
    [2, 'https://portfolio.example/works/second-work/'],
  ]);
  assert.equal(collectionData(site, []).mainEntity.numberOfItems, 0);
});

test('JSON-LD内のHTMLを無効化しつつ元の作品名を正確に復元できる', () => {
  const data = { name: '</script><script>alert(1)</script> <試作> & "写真"' };
  const serialized = serializeStructuredData(data);
  const document = parse(`<script type="application/ld+json">${serialized}</script>`);
  const head = document.childNodes.find((node) => node.tagName === 'html').childNodes.find((node) => node.tagName === 'head');
  assert.equal(head.childNodes.length, 1, '作品名から新しいscript要素が生成されない');
  assert.deepEqual(JSON.parse(head.childNodes[0].childNodes[0].value), data);
  assert.ok(!serialized.includes('<'));
});
