import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./', import.meta.url));
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
await Promise.all(['index.html', 'styles.css'].map(name => copyFile(
  new URL(`./src/${name}`, import.meta.url), new URL(`./dist/${name}`, import.meta.url),
)));
