import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const attrs = (node) => Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
const text = (node) => (node.childNodes ?? []).map((child) => child.value ?? '').join('');
const hash = (value) => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;

// Check the HTML that will actually be served, including Astro's generated hashes.
export function verifyCsp(nodes, label) {
  const policies = nodes.filter((node) => node.tagName === 'meta' && attrs(node)['http-equiv']?.toLowerCase() === 'content-security-policy');
  assert.equal(policies.length, 1, `${label}: CSP が1つ必要です。`);
  assert.equal(policies[0].parentNode?.tagName, 'head', `${label}: CSP は head 内に必要です。`);
  const entries = attrs(policies[0]).content.split(';').map((entry) => entry.trim().split(/\s+/)).filter(([name]) => name);
  const directives = new Map(entries.map(([name, ...values]) => [name, values]));
  assert.equal(directives.size, entries.length, `${label}: CSP の重複指令`);
  for (const name of ['default-src', 'base-uri', 'object-src', 'form-action', 'script-src-attr']) {
    assert.deepEqual(directives.get(name), ["'none'"], `${label}: ${name}`);
  }
  assert.deepEqual(directives.get('img-src'), ["'self'"], `${label}: img-src`);
  for (const name of ['script-src', 'style-src', 'script-src-elem', 'style-src-elem']) {
    const sources = directives.get(name);
    if (name.endsWith('-elem') && !sources) continue;
    assert.ok(sources?.length, `${label}: ${name} が必要です。`);
    assert.ok(sources.every((value) => value === "'self'" || /^'sha256-[A-Za-z0-9+/]{43}='$/.test(value)), `${label}: ${name} に未許可のソース`);
  }
  const scriptSources = directives.get('script-src-elem') ?? directives.get('script-src');
  const styleSources = directives.get('style-src-elem') ?? directives.get('style-src');
  for (const node of nodes) {
    const data = attrs(node);
    assert.ok(!Object.keys(data).some((name) => /^on/i.test(name)), `${label}: インラインイベントは禁止です。`);
    for (const name of ['href', 'src']) {
      assert.ok(!/^javascript:/i.test((data[name] ?? '').replace(/[\s\x00-\x1f]/g, '')), `${label}: javascript URLは禁止です。`);
    }
    const executable = node.tagName === 'script' && (!data.type || ['module', 'text/javascript', 'application/javascript'].includes(data.type));
    const style = node.tagName === 'style';
    const stylesheet = node.tagName === 'link' && data.rel === 'stylesheet';
    if (!executable && !style && !stylesheet) continue;
    assert.ok(nodes.indexOf(policies[0]) < nodes.indexOf(node), `${label}: リソースより前に CSP が必要です。`);
    const sources = executable ? scriptSources : styleSources;
    const url = executable ? data.src : stylesheet ? data.href : undefined;
    if (url) {
      assert.ok(url.startsWith('/') && !url.startsWith('//') && sources.includes("'self'"), `${label}: 外部リソースは許可されていません。`);
    } else {
      assert.ok(sources.includes(hash(text(node))), `${label}: インライン${executable ? 'スクリプト' : 'スタイル'}のハッシュ不一致`);
    }
  }
}
