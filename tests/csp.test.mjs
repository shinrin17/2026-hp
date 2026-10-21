import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parse } from 'parse5';
import { verifyCsp } from '../scripts/verify-csp.mjs';

const code = 'document.documentElement.dataset.ready = "true";';
const digest = createHash('sha256').update(code).digest('base64');
const policy = `default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; img-src 'self'; script-src 'self' 'sha256-${digest}'; script-src-attr 'none'; style-src 'self'; style-src-attr 'unsafe-inline'`;
const markup = `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><script type="module">${code}</script></head><body><main></main></body>`;
const flatten = (node) => [node, ...(node.childNodes ?? []).flatMap(flatten)];
const check = (html) => verifyCsp(flatten(parse(html)), 'fixture');

test('CSP検証は正しいハッシュを許可し、スクリプトの差し替えを検出する', () => {
  assert.doesNotThrow(() => check(markup));
  assert.throws(() => check(markup.replace(code, 'alert("injected")')), /ハッシュ不一致/);
});

test('CSPの欠落・後置・unsafe-inlineへの緩和を検出する', () => {
  assert.throws(() => check(markup.replace(/<meta[^>]+>/, '')), /CSP が1つ/);
  const meta = markup.match(/<meta[^>]+>/)[0];
  assert.throws(() => check(markup.replace(meta, '').replace('</head>', `${meta}</head>`)), /リソースより前/);
  assert.throws(() => check(markup.replace(`script-src 'self'`, `script-src 'self' 'unsafe-inline'`)), /未許可のソース/);
});

test('イベント属性・javascriptリンク・外部スクリプトの混入を検出する', () => {
  assert.throws(() => check(markup.replace('<main>', '<main onclick="alert(1)">')), /インラインイベント/);
  assert.throws(() => check(markup.replace('<main>', '<a href="javascript:alert(1)">link</a><main>')), /javascript URL/);
  assert.throws(() => check(markup.replace('</head>', '<script src="https://example.com/evil.js"></script></head>')), /外部リソース/);
});
