import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { cleanDisplayText, captionMarkdown, formatWork, atomicWrite, readWorks, safeFolder, japanDate } from './work-files.mjs';
import { assertSlug, assertWorkSlugs } from './work-slugs.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function instagramIdentity(value) {
  const url = new URL(value);
  if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.protocol !== 'https:') throw new Error(`Instagram投稿URLではありません: ${value}`);
  const match = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)\/?$/);
  if (!match) throw new Error(`投稿URLを指定してください: ${value}`);
  return { id: `instagram-${match[2]}`, url: `https://www.instagram.com/${match[1]}/${match[2]}/` };
}

function inferTitle(caption) {
  const lines = cleanDisplayText(caption).split('\n').filter((line) => line && line !== '.' && !/[【\[［].*\bworks?/i.test(line));
  if (!lines[0]) throw new Error('タイトルを取得できません。export の title を指定してください。');
  let title = lines[0];
  if (title.length < 22 && lines[1] && !/^(撮影|制作|キービジュアル|MVスチール|メイキング)/.test(lines[1])) title += ` ${lines[1]}`;
  return title;
}

function inferCategories(caption) {
  const role = caption.match(/[【\[［]([^】\]］]*\bworks?)[】\]］]/i)?.[1].toLowerCase() ?? '';
  const values = [];
  if (role.includes('still')) values.push('photo');
  if (/making|director|movie|documentary|live/.test(role)) values.push('movie');
  if (/\b(fd|ad|pm|pa|ca|lighting)\b/.test(role)) values.push('production-staff');
  if (!values.length) {
    if (/メイキング|ムービー|映像|サウナ撮影/.test(caption)) values.push('movie');
    if (/現場制作|撮影補佐|撮影助手|照明|制作進行/.test(caption)) values.push('production-staff');
    if (/写真|スチール|ビジュアル|ジャケット|オフショット|リアルサウンド/.test(caption)) values.push('photo');
  }
  if (!values.length) throw new Error('カテゴリを判定できません。export の categories を指定してください。');
  return values;
}

function baseline(snapshot) {
  return {
    title: snapshot.title, categories: snapshot.categories,
    publishedAt: snapshot.publishedAt, source: snapshot.url,
    images: snapshot.images.map((image) => ({ file: image.file })),
  };
}

export function mergeImport(current, previous, incoming) {
  const next = { ...current.data };
  const conflicts = [];
  const oldData = previous ? baseline(previous) : {};
  const newData = baseline(incoming);
  for (const [key, value] of Object.entries(newData)) {
    if (previous && equal(current.data[key], oldData[key])) next[key] = value;
    else if (!equal(current.data[key], value) && !equal(oldData[key], value)) conflicts.push(key);
  }
  const incomingBody = captionMarkdown(incoming.caption);
  const oldBody = previous ? captionMarkdown(previous.caption).trim() : undefined;
  let body = current.body;
  if (previous && current.body.trim() === oldBody) body = incomingBody;
  else if (current.body.trim() !== incomingBody.trim() && oldBody !== incomingBody.trim()) conflicts.push('本文');
  return { data: next, body, conflicts };
}

export async function importInstagram(exportPath, { root = projectRoot, dryRun = false } = {}) {
  const worksRoot = join(root, 'works');
  const existing = await readWorks(worksRoot);
  const byId = new Map(existing.map((work) => [work.data.workId, work]));
  // Also recognize manual IDs that already point to the same Instagram post.
  for (const work of existing) {
    if (work.data.source?.includes('instagram.com')) {
      const { id } = instagramIdentity(work.data.source);
      if (byId.has(id) && byId.get(id) !== work) throw new Error(`同じ投稿を参照する作品があります: ${id}`);
      byId.set(id, work);
    }
  }
  const used = new Set((await readdir(worksRoot, { withFileTypes: true })).map((entry) => entry.name));
  const rows = JSON.parse(await readFile(exportPath, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) throw new Error('export は1件以上の投稿を含むJSON配列にしてください。');
  const unique = new Map(rows.map((row) => [instagramIdentity(row.url).id, row]));
  const plans = [];
  // Validate every post and decode every image before writing any work.
  for (const [id, row] of unique) {
    const { url } = instagramIdentity(row.url);
    const caption = row.detailCaption ?? row.caption;
    if (typeof caption !== 'string' || !caption.trim()) throw new Error(`${id}: caption が空です。`);
    if (typeof row.date !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.date) || Number.isNaN(Date.parse(row.date))) throw new Error(`${id}: date にタイムゾーン付き日時が必要です。`);
    const publishedAt = japanDate(row.date);
    const current = byId.get(id);
    // Public URLs are editorial choices, never derived again from a changed caption/title.
    const slug = current ? current.data.slug : assertSlug(row.slug);
    let previous;
    if (current) {
      try { previous = JSON.parse(await readFile(join(worksRoot, current.folder, 'instagram.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const title = (row.title ?? previous?.title ?? inferTitle(caption)).trim();
    const categories = row.categories ?? previous?.categories ?? inferCategories(caption);
    if (!title || !Array.isArray(categories) || !categories.length || categories.some((category) => !['photo', 'movie', 'production-staff'].includes(category))) throw new Error(`${id}: title / categories を確認してください。`);
    const folder = current?.folder ?? safeFolder(row.folder ?? title, used);
    used.add(folder);
    const knownImages = new Map();
    for (const image of [...(current?.data.images ?? []), ...(previous?.images ?? [])]) {
      if (!/^img\/[^/\\]+\.(?:jpg|jpeg|png|webp|avif)$/i.test(image.file)) throw new Error(`${id}: 不正な画像パス`);
      try { knownImages.set(hash(await readFile(join(worksRoot, folder, image.file))), image.file); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!Array.isArray(row.files) || !row.files.length) throw new Error(`${id}: files にダウンロード済みの画像が必要です。`);
    const assets = [];
    const seen = new Set();
    for (const file of row.files) {
      const raw = await readFile(resolve(file.path));
      const rawHash = hash(raw);
      const originalName = knownImages.get(rawHash);
      // New downloads have orientation normalized and metadata stripped. Existing identical images keep their URL.
      const buffer = originalName ? raw : await sharp(raw).rotate().jpeg({ quality: 95 }).toBuffer();
      const digest = hash(buffer);
      if (seen.has(digest)) continue;
      seen.add(digest);
      const imageFile = originalName ?? knownImages.get(digest) ?? `img/instagram-${digest.slice(0, 20)}.jpg`;
      const { width, height } = await sharp(buffer).metadata();
      assets.push({ file: imageFile, width, height, cover: Boolean(file.cover), buffer });
    }
    const snapshot = { url, publishedAt, retrievedOn: new Date().toISOString(), title, categories, caption, images: assets.map(({ buffer, ...image }) => image) };
    const merged = current ? mergeImport(current, previous, snapshot) : {
      data: { workId: id, slug, ...baseline(snapshot), draft: false, summary: '', role: '', client: '' },
      body: captionMarkdown(caption), conflicts: [],
    };
    plans.push({ folder, current, assets, snapshot, ...merged });
  }
  const updatedFolders = new Set(plans.map((plan) => plan.folder));
  assertWorkSlugs([...existing.filter((work) => !updatedFolders.has(work.folder)), ...plans]);
  if (!dryRun) for (const plan of plans) {
    const folder = join(worksRoot, plan.folder);
    await mkdir(join(folder, 'img'), { recursive: true });
    for (const image of plan.assets) await atomicWrite(join(folder, image.file), image.buffer);
    await atomicWrite(join(folder, 'index.md'), formatWork(plan.data, plan.body, plan.current?.document));
    await atomicWrite(join(folder, 'instagram.json'), JSON.stringify(plan.snapshot, null, 2) + '\n');
  }
  return plans.map(({ folder, current, conflicts }) => ({ folder, action: current ? '更新' : '追加', conflicts, dryRun }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const exportPath = args.find((arg) => !arg.startsWith('--'));
  if (!exportPath || args.includes('--help')) {
    console.log('使い方: npm run import:instagram -- /absolute/path/export.json [--dry-run]\n既存作品・編集済みの項目を保護して差分取り込みします。');
    process.exit(exportPath ? 0 : 1);
  }
  try {
    const results = await importInstagram(resolve(exportPath), { dryRun: args.includes('--dry-run') });
    for (const result of results) console.log(`${result.dryRun ? '[確認のみ] ' : ''}${result.action}: ${result.folder}${result.conflicts.length ? ` — 手動編集を保持: ${result.conflicts.join(', ')}（instagram.json と比較してください）` : ''}`);
    console.log(`${results.length}件。既存の他作品は保持しました。npm run verify で確認してください。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
