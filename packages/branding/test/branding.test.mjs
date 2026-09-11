import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildBrand, validateBrand } from '../build-brand.mjs';

const testRoot = fileURLToPath(new URL('../../../.local/branding-tests/', import.meta.url));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');

test('known fields preserve Unicode; unsupported settings and executable/credential-bearing values fail', () => {
  const brand = validateBrand({ displayName: '우리 팀 <&> "도구"', accentColor: '#ffff00', links: { docs: 'https://example.com/docs?a=1&b=2' } });
  assert.equal(brand.displayName, '우리 팀 <&> "도구"');
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

test('build freezes inputs; a rebuild clears old outputs and preserves source assets', async () => {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, 'brand-'));
  try {
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    await mkdir(path.join(directory, 'assets'));
    await writeFile(path.join(directory, 'assets', '로고.png'), png);
    await writeFile(path.join(directory, 'brand.json'), JSON.stringify({ displayName: '우리 팀', logo: 'assets/로고.png', favicon: 'assets/로고.png' }));
    await buildBrand(directory);
    const index = pathToFileURL(path.join(directory, 'dist', 'index.js')).href;
    const first = (await import(index + '?first')).brand;
    assert.equal(first.displayName, '우리 팀');
    assert.equal(first.logo, 'brand-logo.png');
    assert.ok(Object.isFrozen(first.links));
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"Worknaru"}');
    assert.equal((await import(index + '?not-rebuilt')).brand.displayName, '우리 팀');
    await buildBrand(directory);
    assert.equal((await import(index + '?rebuilt')).brand.displayName, 'Worknaru');
    assert.deepEqual((await readdir(path.join(directory, 'dist'))).sort(), ['index.d.ts', 'index.js']);
    assert.deepEqual(await readFile(path.join(directory, 'assets', '로고.png')), png);
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"Bad","logo":"assets/missing.png"}');
    await assert.rejects(buildBrand(directory), /ENOENT/);
    await writeFile(path.join(directory, 'assets', 'bad.png'), 'not PNG');
    await writeFile(path.join(directory, 'brand.json'), '{"displayName":"Bad","logo":"assets/bad.png"}');
    await assert.rejects(buildBrand(directory), /matching PNG/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
