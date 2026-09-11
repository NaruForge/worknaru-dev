import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${label} contains an unknown field: ${key}`);
  }
}

export function validateBrand(input) {
  object(input, 'brand', ['displayName', 'accentColor', 'logo', 'favicon', 'links']);
  const displayName = input.displayName;
  if (typeof displayName !== 'string' || !displayName.trim() || displayName !== displayName.trim()
    || displayName.length > 80 || !/^[A-Za-z0-9가-힣 ._&()-]+$/.test(displayName)) {
    throw new Error('brand.displayName must be 1..80 characters using Hangul syllables, ASCII letters/digits, ordinary spaces and - _ . & ( ), without surrounding whitespace.');
  }
  const accentColor = input.accentColor === undefined ? '#225c9e' : input.accentColor;
  if (typeof accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(accentColor)) {
    throw new Error('brand.accentColor must be #RRGGBB.');
  }
  const channels = accentColor.slice(1).match(/../g).map(hex => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const onAccentColor = luminance > 0.179 ? '#000000' : '#ffffff';
  const links = {};
  if (input.links !== undefined) {
    object(input.links, 'brand.links', ['home', 'docs', 'support']);
    for (const [key, value] of Object.entries(input.links)) {
      let url;
      try { url = new URL(value); } catch { /* Report the field, never a credential-bearing value. */ }
      if (typeof value !== 'string' || !url || !['http:', 'https:'].includes(url.protocol)
        || url.username || url.password || /[^\x21-\x7e]/.test(value)) {
        throw new Error(`brand.links.${key} must be an ASCII HTTP(S) URL without credentials or whitespace; encode international domains with Punycode and paths with percent encoding.`);
      }
      links[key] = url.href;
    }
  }
  for (const key of ['logo', 'favicon']) {
    const allowed = key === 'logo' ? ['assets/logo.png'] : ['assets/favicon.png', 'assets/favicon.ico'];
    if (input[key] !== undefined && !allowed.includes(input[key])) {
      throw new Error(`brand.${key} must be ${allowed.join(' or ')}.`);
    }
  }
  return { displayName, accentColor, onAccentColor, links };
}

export async function buildBrand(directory) {
  const input = JSON.parse(await readFile(path.join(directory, 'brand.json'), 'utf8'));
  const brand = validateBrand(input);
  const assets = [];
  for (const key of ['logo', 'favicon']) {
    brand[key] = null;
    if (input[key] === undefined) continue;
    const assetRoot = await realpath(path.join(directory, 'assets'));
    const source = await realpath(path.join(directory, input[key]));
    if (path.dirname(source) !== assetRoot) throw new Error(`brand.${key} must stay inside assets/.`);
    const info = await stat(source);
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error(`brand.${key} must be a file of at most 1 MiB.`);
    const data = await readFile(source);
    const extension = path.extname(input[key]);
    const signature = extension === '.png' ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from([0, 0, 1, 0]);
    if (data.length > 1024 * 1024 || !data.subarray(0, signature.length).equals(signature)) {
      throw new Error(`brand.${key} must be a matching PNG/ICO file of at most 1 MiB.`);
    }
    const name = `brand-${key}${extension}`;
    assets.push({ name, data });
    brand[key] = name;
  }
  // Only this package's generated dist is replaced; manifest/assets are inputs.
  const output = path.join(path.resolve(directory), 'dist');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const { name, data } of assets) await writeFile(path.join(output, name), data);
  await writeFile(path.join(output, 'index.js'), `const value = ${JSON.stringify(brand, null, 2)};\nObject.freeze(value.links);\nexport const brand = Object.freeze(value);\n`);
  await writeFile(path.join(output, 'index.d.ts'), `export declare const brand: Readonly<{
  displayName: string;
  accentColor: string;
  onAccentColor: string;
  logo: string | null;
  favicon: string | null;
  links: Readonly<Partial<Record<'home' | 'docs' | 'support', string>>>;
}>;\n`);
  return brand;
}
