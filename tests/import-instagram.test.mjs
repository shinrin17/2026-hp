import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { importInstagram, instagramIdentity } from '../scripts/import-instagram.mjs';
import { parseWork, formatWork, readWorks, japanDate } from '../scripts/work-files.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'portfolio-import-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'works'));
  const image = join(root, 'download.png');
  await sharp({ create: { width: 40, height: 30, channels: 3, background: '#112233' } }).png().toFile(image);
  const row = { url: 'https://www.instagram.com/m_ichirinka/p/TEST_1/?utm_source=test', slug: 'test-work', date: '2026-09-30T16:00:00Z', title: 'テスト #作品 / 一', categories: ['photo'], caption: '【Still work】\n作品の紹介\n\n撮影しました。', files: [{ path: image, cover: false }] };
  const exportPath = join(root, 'export.json');
  const run = async (rows = [row], options = {}) => {
    await writeFile(exportPath, JSON.stringify(rows));
    return importInstagram(exportPath, { root, ...options });
  };
  return { root, row, run };
}

test('差分取り込み・URL表記揺れ・日本時間・画像再利用', async (t) => {
  const { root, row, run } = await fixture(t);
  await run();
  const first = (await readWorks(join(root, 'works')))[0];
  assert.equal(first.data.publishedAt.slice(0, 10), '2026-10-01');
  assert.equal(first.data.images.length, 1);
  const imageFiles = await readdir(join(root, 'works', first.folder, 'img'));
  await run([{ ...row, url: 'https://instagram.com/p/TEST_1/', slug: 'changed-slug', title: '変更後の作品名', caption: '【Still work】\n更新した本文' }]);
  const works = await readWorks(join(root, 'works'));
  assert.equal(works.length, 1);
  assert.match(works[0].body, /更新した本文/);
  assert.equal(works[0].folder, first.folder);
  assert.equal(works[0].data.title, '変更後の作品名');
  assert.equal(works[0].data.slug, 'test-work');
  assert.deepEqual(await readdir(join(root, 'works', first.folder, 'img')), imageFiles);
});

test('新規投稿だけの取り込みでも既存・手動作品を残す', async (t) => {
  const { root, row, run } = await fixture(t);
  const manual = join(root, 'works', '手動作品');
  await mkdir(manual);
  const manualContent = formatWork({ workId: 'manual-1', title: '手動作品', categories: ['photo'], publishedAt: japanDate(), draft: true, images: [] }, '手作業の本文');
  await writeFile(join(manual, 'index.md'), manualContent);
  await run();
  await run([{ ...row, slug: 'test-work-2', url: 'https://www.instagram.com/p/TEST_2/' }]);
  assert.equal((await readWorks(join(root, 'works'))).length, 3);
  assert.equal(await readFile(join(manual, 'index.md'), 'utf8'), manualContent);
});

test('編集済みのタイトル・本文・画像注釈・追加項目を保持し、取得記録を更新する', async (t) => {
  const { root, row, run } = await fixture(t);
  await run();
  const work = (await readWorks(join(root, 'works')))[0];
  work.data.title = '手修正した作品名';
  work.data.role = 'スチール撮影';
  work.data.images[0].alt = '編集した代替テキスト';
  await writeFile(work.path, formatWork(work.data, '## 概要\n\n人が編集した説明文。', work.document));
  const result = await run([{ ...row, title: '取得した新タイトル', caption: 'Instagram上の新しい説明' }]);
  const updated = parseWork(await readFile(work.path, 'utf8'));
  assert.equal(updated.data.title, '手修正した作品名');
  assert.equal(updated.data.role, 'スチール撮影');
  assert.equal(updated.data.images[0].alt, '編集した代替テキスト');
  assert.match(updated.body, /人が編集した説明文/);
  assert.ok(result[0].conflicts.includes('本文'));
  const snapshot = JSON.parse(await readFile(join(root, 'works', work.folder, 'instagram.json'), 'utf8'));
  assert.equal(snapshot.caption, 'Instagram上の新しい説明');
  assert.equal(snapshot.title, '取得した新タイトル');
});

test('dry-run はファイルを書き換えない', async (t) => {
  const { root, run } = await fixture(t);
  const result = await run(undefined, { dryRun: true });
  assert.equal(result[0].dryRun, true);
  assert.deepEqual(await readdir(join(root, 'works')), []);
});

test('途中の投稿に画像エラーがあっても、他の投稿を書き換えない', async (t) => {
  const { root, row, run } = await fixture(t);
  await assert.rejects(run([row, { ...row, url: 'https://www.instagram.com/p/BROKEN/', files: [{ path: join(root, 'missing.jpg') }] }]), /ENOENT/);
  assert.deepEqual(await readdir(join(root, 'works')), []);
});

test('再クロールのない手動追加作品も、取得記録がない状態から保護する', async (t) => {
  const { root, row, run } = await fixture(t);
  const folder = join(root, 'works', '手動で登録済み');
  await mkdir(folder);
  await writeFile(join(folder, 'index.md'), formatWork({ workId: 'manual-existing', title: '独自タイトル', categories: ['movie'], publishedAt: '2026-01-01T00:00:00+09:00', draft: true, source: row.url, images: [] }, '独自の本文'));
  await run();
  const works = await readWorks(join(root, 'works'));
  assert.equal(works.length, 1);
  assert.equal(works[0].data.title, '独自タイトル');
  assert.equal(works[0].data.workId, 'manual-existing');
  assert.match(works[0].body, /独自の本文/);
});

test('認識する投稿URLを限定する', () => {
  assert.equal(instagramIdentity('https://www.instagram.com/reel/abc-123/').id, 'instagram-abc-123');
  assert.throws(() => instagramIdentity('https://example.com/p/abc/'));
  assert.throws(() => instagramIdentity('https://www.instagram.com/m_ichirinka/'));
});

test('手動追加はリンクなしの下書きを作り、同名作品を上書きしない', async (t) => {
  const { newWork } = await import('../scripts/new-work.mjs');
  const { root } = await fixture(t);
  const first = await newWork('手動作品', { root });
  const second = await newWork('手動作品', { root });
  assert.notEqual(first, second);
  const work = parseWork(await readFile(first, 'utf8'));
  assert.equal(work.data.draft, true);
  assert.equal(work.data.slug, '');
  assert.equal(work.data.source, undefined);
  assert.match(work.body, /## 担当したこと/);
  assert.match(work.body, /## クレジット/);
});

test('新規取り込みには有効なslugが必要で、エラー時は書き込まない', async (t) => {
  const { root, row, run } = await fixture(t);
  for (const slug of [undefined, '', '日本語', 'Uppercase', '../escape', 'double--hyphen', 'a'.repeat(65)]) {
    await assert.rejects(run([{ ...row, slug }]), /slug/);
    assert.deepEqual(await readdir(join(root, 'works')), []);
  }
});

test('同時取り込み・既存作品とのslug重複は、全件の書き込み前に停止する', async (t) => {
  const { root, row, run } = await fixture(t);
  const other = { ...row, url: 'https://www.instagram.com/p/TEST_2/' };
  await assert.rejects(run([row, other]), /slug が重複/);
  assert.deepEqual(await readdir(join(root, 'works')), []);
  await run();
  const work = (await readWorks(join(root, 'works')))[0];
  const original = await readFile(work.path, 'utf8');
  await assert.rejects(run([{ ...row, caption: '更新を保存しない' }, other]), /slug が重複/);
  assert.equal(await readFile(work.path, 'utf8'), original);
  assert.equal((await readWorks(join(root, 'works'))).length, 1);
  // Existing posts may omit slug; a re-import still preserves their public URL.
  await run([{ ...row, slug: undefined }]);
  assert.equal((await readWorks(join(root, 'works')))[0].data.slug, 'test-work');
});

test('手動追加で指定したslugを保持し、重複する下書きを作成しない', async (t) => {
  const { newWork } = await import('../scripts/new-work.mjs');
  const { root } = await fixture(t);
  const path = await newWork('作品一', { root, slug: 'artist-title' });
  assert.equal(parseWork(await readFile(path, 'utf8')).data.slug, 'artist-title');
  await assert.rejects(newWork('作品二', { root, slug: 'artist-title' }), /slug が重複/);
  assert.deepEqual(await readdir(join(root, 'works')), ['作品一']);
});

test('公開作品のslug必須・下書きのURL予約・別作品の旧URLとの衝突', async () => {
  const { assertWorkSlugs } = await import('../scripts/work-slugs.mjs');
  const work = (folder, slug, draft = false) => ({ folder, data: { slug, draft } });
  assert.throws(() => assertWorkSlugs([work('作品', '')]), /slug/);
  assert.doesNotThrow(() => assertWorkSlugs([work('作品', '', true)]));
  assert.throws(() => assertWorkSlugs([work('作品一', 'artist-title', true), work('作品二', 'artist-title')]), /重複/);
  assert.throws(() => assertWorkSlugs([work('old-url', 'new-url'), work('作品二', 'old-url')]), /旧URLと衝突/);
  assert.doesNotThrow(() => assertWorkSlugs([work('same-url', 'same-url')]));
});

test('Instagramの区切り線・番号・URL・引用符をMarkdown化しても表示内容を保つ', async () => {
  const { captionMarkdown, cleanDisplayText } = await import('../scripts/work-files.mjs');
  const { createSatteriMarkdownProcessor } = await import('@astrojs/markdown-satteri');
  const { parse } = await import('parse5');
  const caption = "Director's credit\n\n------\n\n3. Sweet Igloo\n\nURL : https://example.com/watch?v=a_b&ab_channel=test\n\n<script>文字として表示</script>";
  const renderer = await createSatteriMarkdownProcessor({ features: { smartPunctuation: false } });
  const { code } = await renderer.render(captionMarkdown(caption));
  const text = (node) => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  assert.equal(normalize(text(parse(code))), normalize(cleanDisplayText(caption)));
  assert.ok(!code.includes('<script>'));
  assert.ok(code.includes('href="https://example.com/watch?v=a_b'));
});
