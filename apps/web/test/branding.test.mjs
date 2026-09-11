import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { brand } from '@worknaru/branding';
import { escapeHtml, renderBrand } from '../branding.mjs';

test('HTML branding escapes text and attributes without changing runtime IDs or reinterpreting user text', async () => {
  const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const name = '팀 <script>alert(1)</script> & "name" {{brand.links}}';
  const html = renderBrand(template, { ...brand, displayName: name, logo: 'brand-logo.png', links: { docs: 'https://example.com/?a=1&b="2"' } });
  assert.ok(html.includes(`<title>연결 확인 · ${escapeHtml(name)}</title>`));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('href="https://example.com/?a=1&amp;b=&quot;2&quot;"'));
  assert.ok(html.includes('id="server-id"'));
  assert.ok(html.includes('{{brand.links}}'));
});

test('built web uses the compiled brand and optional entries can be absent', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
  assert.ok(html.includes(`<title>연결 확인 · ${escapeHtml(brand.displayName)}</title>`));
  assert.ok(css.includes(`--brand-color: ${brand.accentColor}`));
  assert.ok(css.includes(`--brand-on-color: ${brand.onAccentColor}`));
  assert.equal(renderBrand('{{brand.logo}}|{{brand.links}}|{{brand.favicon}}', { ...brand, logo: null, favicon: null, links: {} }), '||data:,');
});
