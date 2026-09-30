import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, Document } from 'yaml';

export function cleanDisplayText(text) {
  return text
    .replace(/[@＠][\p{L}\p{N}_.]+/gu, '')
    .replace(/[#＃][\p{L}\p{N}_]+/gu, '')
    .replace(/[0-9#*]\ufe0f?\u20e3/gu, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2300-\u23FF\u200d\ufe0e\ufe0f\u20e3]/gu, '')
    .split('\n').map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// Instagram text is plain text. Escape Markdown so credits aren't interpreted as markup.
export function captionMarkdown(caption) {
  return cleanDisplayText(caption).split(/(https?:\/\/[^\s<>「」『』（）]+)/g).map((part, index) => {
    if (index % 2) return `<${part}>`;
    return part.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&')
      .replace(/^([-+=])/gm, '\\$1')
      .replace(/^(\d+)([.)])(?= )/gm, '$1\\$2');
  }).join('') + '\n';
}

export function parseWork(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('index.md は YAML frontmatter（---）で開始してください。');
  const document = parseDocument(match[1]);
  if (document.errors.length) throw document.errors[0];
  return { data: document.toJS(), body: match[2].trim() + '\n', document };
}

export function formatWork(data, body, existingDocument) {
  const document = existingDocument ?? new Document(data);
  if (!existingDocument) {
    const comments = {
      workId: ' 管理用ID。公開後は変更しないでください。',
      slug: ' 公開URL: /works/slug/。公開後は変更しないでください。',
      title: ' ① ページ上部：作品名・カテゴリ・日付',
      summary: ' ② 紹介文・担当。空欄は表示しません。summary は検索・SNSにも使用。',
      images: ' ③ ギャラリー：並び順＝表示順。先頭が一覧サムネイル。alt / caption も追加できます。',
      source: ' ④ 元投稿・公式ページへのリンク。手動作品では省略可能。',
    };
    for (const [key, comment] of Object.entries(comments)) {
      const pair = document.contents.items.find((item) => item.key.value === key);
      if (pair) pair.key.commentBefore = comment;
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      if (JSON.stringify(document.get(key)?.toJSON?.() ?? document.get(key)) !== JSON.stringify(value)) document.set(key, value);
    }
  }
  // Quote dates for compatibility with YAML 1.1 and Markdown tooling.
  const date = document.get('publishedAt', true);
  if (date) date.type = 'QUOTE_DOUBLE';
  return `---\n${document.toString({ lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

export function japanDate(value = new Date()) {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00');
}

// Match Astro's decoded request pathname, retaining encoded URL separators.
export function routeSegment(value) {
  return decodeURI(encodeURIComponent(value.normalize()));
}

export async function atomicWrite(path, text) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
}

export async function readWorks(root) {
  const works = [];
  for (const folder of (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
    const path = join(root, folder.name, 'index.md');
    let text;
    try { text = await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    works.push({ folder: folder.name, path, ...parseWork(text) });
  }
  const ids = works.map((work) => work.data.workId);
  if (new Set(ids).size !== ids.length) throw new Error('workId が重複しています。');
  return works;
}

export function safeFolder(title, used) {
  const base = title.replace(/[\/\\]/g, '／').replace(/[\x00-\x1f]/g, '').trim();
  if (!base || base === '.' || base === '..') throw new Error('作品フォルダ名を指定してください。');
  let folder = base;
  for (let index = 2; used.has(folder); index++) folder = `${base}（${index}）`;
  return folder;
}
