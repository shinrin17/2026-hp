import { mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { formatWork, safeFolder, atomicWrite, japanDate, readWorks } from './work-files.mjs';
import { assertWorkSlugs } from './work-slugs.mjs';

export async function newWork(title, { root = fileURLToPath(new URL('../', import.meta.url)), slug = '' } = {}) {
  const worksRoot = join(root, 'works');
  const folder = safeFolder(title, new Set(await readdir(worksRoot)));
  const path = join(worksRoot, folder);
  const data = {
    workId: `manual-${randomUUID()}`,
    slug,
    title,
    categories: ['photo'],
    publishedAt: japanDate(),
    draft: true,
    summary: '',
    role: '',
    client: '',
    images: [],
  };
  assertWorkSlugs([...(await readWorks(worksRoot)), { folder, data }]);
  await mkdir(join(path, 'img'), { recursive: true });
  const body = `<!-- ⑤ 本文：以下は編集用の下書きです。公開前に事実に合わせて記入してください。 -->\n\n## 作品について\n\n作品の概要を記入します。\n\n## 担当したこと\n\n担当した業務・撮影内容を記入します。\n\n## クレジット\n\n公開できる担当者・制作会社を記入します。\n`;
  await atomicWrite(join(path, 'index.md'), formatWork(data, body));
  return resolve(path, 'index.md');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ options: { slug: { type: 'string' }, help: { type: 'boolean' } }, allowPositionals: true });
    const title = positionals.join(' ').trim();
    if (!title || values.help) {
      console.log('使い方: npm run new:work -- "作品タイトル" --slug artist-title\n作品フォルダと下書きの index.md を作成します。slug は省略可能ですが、公開前に記入してください。');
      process.exit(values.help ? 0 : 1);
    }
    console.log(`${await newWork(title, { slug: values.slug })}\nimg/ に画像を置き、images に登録してください。公開時は slug を確認し、draft: false に変更します。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
