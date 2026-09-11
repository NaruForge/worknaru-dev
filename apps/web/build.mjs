import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { brand } from '@worknaru/branding';
import { renderBrand } from './branding.mjs';

const directory = fileURLToPath(new URL('./', import.meta.url));
// dist contains generated web assets only. Runtime connection data lives under the data root.
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: directory,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/app.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  logLevel: 'info',
});
const html = renderBrand(await readFile(new URL('./src/index.html', import.meta.url), 'utf8'), brand);
const css = `:root { --brand-color: ${brand.accentColor}; --brand-on-color: ${brand.onAccentColor}; }\n`
  + await readFile(new URL('./src/styles.css', import.meta.url), 'utf8');
await writeFile(new URL('./dist/index.html', import.meta.url), html);
await writeFile(new URL('./dist/styles.css', import.meta.url), css);
const brandDirectory = path.dirname(fileURLToPath(import.meta.resolve('@worknaru/branding')));
for (const asset of [brand.logo, brand.favicon].filter(Boolean)) {
  await copyFile(path.join(brandDirectory, asset), path.join(directory, 'dist', asset));
}
