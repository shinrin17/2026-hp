import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import sharp from 'sharp';
import { newWork } from '../scripts/new-work.mjs';
import { importInstagram } from '../scripts/import-instagram.mjs';
import { readWorks, parseWork, formatWork } from '../scripts/work-files.mjs';
import { getWorkThumbnail, getWorkHeroImage, renderWorkThumbnail } from '../scripts/work-thumbnails.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-thumbnails-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'works'));
  return root;
}

const sourceImage = (width, height, background = '#224466') => sharp({
  create: { width, height, channels: 3, background },
});

test('トップは一覧のWebPを共用し、高精細画面向けだけ追加して元画像以上に拡大しない', async (t) => {
  const root = await fixture(t);
  const folder = '代表作';
  const imageDir = join(root, 'works', folder, 'img');
  await mkdir(imageDir, { recursive: true });
  await sourceImage(1920, 1440).jpeg().toFile(join(imageDir, '01.jpg'));
  const data = { slug: 'featured', title: '代表作', images: [{ file: 'img/01.jpg' }] };
  const list = await getWorkThumbnail(folder, data, join(root, 'works'));
  const hero = await getWorkHeroImage(folder, data, join(root, 'works'));
  assert.deepEqual(hero.variants.slice(0, 3), list.variants);
  assert.deepEqual(hero.variants.map(({ width }) => width), [400, 800, 1200, 1680, 1920]);
  assert.equal(hero.src, list.variants[2].src);
  const metadata = await sharp(await renderWorkThumbnail(hero.sourcePath, 1680)).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1680);
  assert.equal(metadata.height, 1260);
});

test('手動追加の先頭からWebPを生成し、並び替え・同名画像の更新でURLが変わる', async (t) => {
  const root = await fixture(t);
  const markdown = await newWork('写真 #1 & 作品', { root, slug: 'manual-thumbnail' });
  const folder = basename(dirname(markdown));
  const firstPath = join(dirname(markdown), 'img', '01.jpg');
  const secondPath = join(dirname(markdown), 'img', '02.png');
  await sourceImage(1600, 1000).jpeg().toFile(firstPath);
  await sourceImage(900, 1200, '#cc6644').png().toFile(secondPath);
  const work = parseWork(await readFile(markdown, 'utf8'));
  work.data.draft = false;
  work.data.images = [{ file: 'img/01.jpg', alt: '手動作品の写真' }, { file: 'img/02.png' }];
  await writeFile(markdown, formatWork(work.data, work.body));
  const saved = (await readWorks(join(root, 'works')))[0];
  const thumbnail = await getWorkThumbnail(saved.folder, saved.data, join(root, 'works'));
  const original = await readFile(firstPath);
  assert.deepEqual(thumbnail.variants.map(({ width }) => width), [400, 800, 1200]);
  assert.equal(thumbnail.alt, '手動作品の写真');
  for (const variant of thumbnail.variants) {
    const result = await renderWorkThumbnail(thumbnail.sourcePath, variant.width);
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, variant.width);
    assert.equal(metadata.height, variant.width * 1000 / 1600);
  }
  assert.deepEqual(await readFile(firstPath), original);
  const reordered = await getWorkThumbnail(folder, { ...saved.data, images: [...saved.data.images].reverse() }, join(root, 'works'));
  assert.notEqual(reordered.src, thumbnail.src);
  assert.equal(reordered.width, 900);
  assert.equal(reordered.height, 1200);
  await sourceImage(1600, 1000, '#eeaa66').jpeg().toFile(firstPath);
  const updated = await getWorkThumbnail(folder, saved.data, join(root, 'works'));
  assert.notEqual(updated.src, thumbnail.src);
  assert.equal((await getWorkThumbnail(folder, saved.data, join(root, 'works'))).src, updated.src);
});

test('Instagramの新規取り込み・再取得も公開Markdownの先頭を自動で使う', async (t) => {
  const root = await fixture(t);
  const image = join(root, 'download.png');
  await sourceImage(1000, 750).png().toFile(image);
  const row = { url: 'https://www.instagram.com/p/THUMB_TEST/', slug: 'instagram-thumbnail', date: '2026-10-01T12:00:00+09:00', title: '取り込み作品', categories: ['photo'], caption: '【Still work】\n撮影しました。', files: [{ path: image }] };
  const exportPath = join(root, 'export.json');
  await writeFile(exportPath, JSON.stringify([row]));
  await importInstagram(exportPath, { root });
  const first = (await readWorks(join(root, 'works')))[0];
  assert.equal(first.data.draft, false);
  const before = await getWorkThumbnail(first.folder, first.data, join(root, 'works'));
  assert.deepEqual(before.variants.map(({ width }) => width), [400, 800, 1000]);
  assert.equal((await sharp(await renderWorkThumbnail(before.sourcePath, 800)).metadata()).format, 'webp');
  await sourceImage(1000, 750, '#ffcc88').png().toFile(image);
  await importInstagram(exportPath, { root });
  const second = (await readWorks(join(root, 'works')))[0];
  const after = await getWorkThumbnail(second.folder, second.data, join(root, 'works'));
  assert.equal(second.data.slug, first.data.slug);
  assert.notEqual(after.src, before.src);
});

test('EXIFの回転・透明画像・小さい画像を保持し、元画像を変更しない', async (t) => {
  const root = await fixture(t);
  const folder = '向きと透明度';
  const imageDir = join(root, 'works', folder, 'img');
  await mkdir(imageDir, { recursive: true });
  const oriented = join(imageDir, 'rotated.jpg');
  await sourceImage(900, 600).withMetadata({ orientation: 6 }).jpeg().toFile(oriented);
  const data = { slug: 'orientation', title: '向き', images: [{ file: 'img/rotated.jpg' }] };
  const thumbnail = await getWorkThumbnail(folder, data, join(root, 'works'));
  assert.equal(thumbnail.width, 600);
  assert.equal(thumbnail.height, 900);
  const rotated = await sharp(await renderWorkThumbnail(oriented, 400)).metadata();
  assert.equal(rotated.width, 400);
  assert.equal(rotated.height, 600);
  assert.equal(rotated.orientation, undefined);
  const oddRatio = join(imageDir, 'odd-ratio.jpg');
  await sourceImage(2062, 1440).jpeg().toFile(oddRatio);
  const resized = await sharp(await renderWorkThumbnail(oddRatio, 400)).metadata();
  assert.equal(resized.width, 400);
  assert.equal(resized.height, Math.round(1440 * 400 / 2062));
  const transparent = join(imageDir, 'small.png');
  await sharp({ create: { width: 101, height: 79, channels: 4, background: '#00000000' } }).png().toFile(transparent);
  const original = await readFile(transparent);
  const small = await getWorkThumbnail(folder, { ...data, images: [{ file: 'img/small.png' }] }, join(root, 'works'));
  assert.deepEqual(small.variants.map(({ width }) => width), [101]);
  const output = await sharp(await renderWorkThumbnail(transparent, 400)).metadata();
  assert.equal(output.width, 101);
  assert.equal(output.height, 79);
  assert.equal(output.hasAlpha, true);
  assert.deepEqual(await readFile(transparent), original);
});
