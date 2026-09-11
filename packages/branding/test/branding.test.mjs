import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildBrand, validateBrand } from '../build-brand.mjs';

const testRoot = fileURLToPath(new URL('../../../.local/branding-tests/', import.meta.url));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');

test('supported text and colors survive validation; unsupported settings fail', () => {
  const brand = validateBrand({ displayName: '우리 팀 & Co. (도구_2-0)', accentColor: '#ffff00', links: { docs: 'https://example.com/docs?a=1&b=2' } });
  assert.equal(brand.displayName, '우리 팀 & Co. (도구_2-0)');
  assert.equal(brand.onAccentColor, '#000000');
  assert.equal(validateBrand({ displayName: 'Worknaru' }).onAccentColor, '#ffffff');
  for (const input of [null, [], {}, { displayName: '' }, { displayName: ' x ' }, { displayName: 'x\ny' },
    { displayName: '\u001b[31m' }, { displayName: 'a'.repeat(81) }, { displayName: 'x', envPrefix: 'OTHER' },
    { displayName: 'x', accentColor: 'red;display:none' }, { displayName: 'x', accentColor: null },
    { displayName: 'x', links: { arbitrary: 'https://example.com' } },
    { displayName: 'x', links: { home: 'javascript:alert(1)' } },
    { displayName: 'x', links: { docs: 'https://user:secret@example.com' } },
    { displayName: 'x', logo: '../private.png' }, { displayName: 'x', logo: 'assets/logo.svg' },
    { displayName: 'x', favicon: null }]) assert.throws(() => validateBrand(input));
});

test('display names allow composed Korean and ordinary spaces but reject unsupported characters', () => {
  assert.equal(validateBrand({ displayName: '가'.repeat(80) }).displayName.length, 80);
  for (const displayName of ['우리\u00a0팀', '우리\u3000팀', '우리\t팀', '우리\n팀', '우리\u200b팀',
    '우리 팀\n', '우리 팀 🚀', '한글'.normalize('NFD'), 'ㄱㄴ', 'Café', '팀 <도구>', '팀 "도구"', 'a/b']) {
    assert.throws(() => validateBrand({ displayName }), /brand.displayName/);
  }
});

test('links require ASCII input while accepting encoded international addresses', () => {
  const docs = new URL('https://한글.example/우리 팀?q=한글').href;
  assert.match(docs, /^https:\/\/xn--/);
  assert.match(docs, /%20/);
  assert.equal(validateBrand({ displayName: '우리 팀', links: { docs } }).links.docs, docs);
  for (const value of ['https://한글.example/', 'https://example.com/문서', 'https://example.com/a b',
    'https://example.com/a\u00a0b', 'https://example.com/\n', 'https://example.com/\u007f',
    'https://user:secret@example.com', 'file:///docs']) {
    assert.throws(() => validateBrand({ displayName: '우리 팀', links: { docs: value } }), /brand.links.docs/);
  }
});

test('asset inputs use only fixed filenames', () => {
  for (const favicon of ['assets/favicon.png', 'assets/favicon.ico']) {
    assert.doesNotThrow(() => validateBrand({ displayName: '우리 팀', logo: 'assets/logo.png', favicon }));
  }
  for (const [key, value] of [['logo', 'assets/로고.png'], ['logo', 'assets/my logo.png'],
    ['logo', 'assets/other.png'], ['logo', 'assets/Logo.png'], ['logo', 'assets/sub/logo.png'],
    ['logo', 'assets/../assets/logo.png'], ['logo', 'assets/logo.ico'], ['favicon', 'assets/logo.png'],
    ['favicon', 'assets/파비콘.ico'], ['favicon', 'assets/favicon.ICO']]) {
    assert.throws(() => validateBrand({ displayName: '우리 팀', [key]: value }), new RegExp(`brand.${key}`));
  }
});

test('build freezes inputs; a rebuild clears old outputs and preserves source assets', async () => {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'brand-'));
  try {
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await mkdir(path.join(directory, 'assets'));
    await writeFile(path.join(directory, 'assets', 'logo.png'), png);
    await writeFile(path.join(directory, 'assets', 'favicon.png'), png);
    await writeFile(path.join(directory, 'assets', 'favicon.ico'), Buffer.from([0, 0, 1, 0, 1, 0]));
    await writeFile(path.join(directory, 'brand.json'), JSON.stringify({ displayName: '우리 팀', logo: 'assets/logo.png', favicon: 'assets/favicon.ico' }));
    await buildBrand(directory);
    const index = pathToFileURL(path.join(directory, 'dist', 'index.js')).href;
    const first = (await import(index + '?first')).brand;
    assert.equal(first.displayName, '우리 팀');
    assert.equal(first.logo, 'brand-logo.png');
    assert.equal(first.favicon, 'brand-favicon.ico');
    assert.ok(Object.isFrozen(first.links));
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"우리 팀","favicon":"assets/favicon.png"}');
    await buildBrand(directory);
    assert.ok(!(await readdir(path.join(directory, 'dist'))).includes('brand-favicon.ico'));
    assert.deepEqual(await readFile(path.join(directory, 'dist', 'brand-favicon.png')), png);
    // Snapshot the original build again before changing only its input.
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"우리 팀"}');
    await buildBrand(directory);
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"Worknaru"}');
    assert.equal((await import(index + '?not-rebuilt')).brand.displayName, '우리 팀');
    await buildBrand(directory);
    assert.equal((await import(index + '?rebuilt')).brand.displayName, 'Worknaru');
    assert.deepEqual((await readdir(path.join(directory, 'dist'))).sort(), ['index.d.ts', 'index.js']);
    assert.deepEqual(await readFile(path.join(directory, 'assets', 'logo.png')), png);
    await rm(path.join(directory, 'assets', 'logo.png'));
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"Bad","logo":"assets/logo.png"}');
    await assert.rejects(buildBrand(directory), /ENOENT/);
    await writeFile(path.join(directory, 'assets', 'logo.png'), 'not PNG');
    await assert.rejects(buildBrand(directory), /matching PNG/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
