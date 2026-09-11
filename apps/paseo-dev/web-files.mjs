import { copyFile, lstat, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const required = ['index.html', 'app.js', 'styles.css'];
const optional = ['brand-logo.png', 'brand-favicon.png', 'brand-favicon.ico'];

export async function prepareWebFiles(buildDirectory, paths) {
  const names = await readdir(buildDirectory);
  for (const name of required) {
    if (!names.includes(name)) throw new Error(`Missing web asset ${name}; run pnpm build.`);
  }
  const files = [...required, ...optional.filter(name => names.includes(name))];
  for (const name of files) {
    if (!(await lstat(path.join(buildDirectory, name))).isFile()) throw new Error(`Web asset must be a regular file: ${name}`);
  }
  // A fresh directory cannot serve a previous run's connection data or old brand assets.
  // Only these public build files are copied; config/logs and stale connection.json are excluded.
  const directory = await mkdtemp(path.join(paths.temporary, 'web-'));
  const cleanup = async () => {
    const relative = path.relative(paths.temporary, directory);
    if (!relative.startsWith('web-') || relative.includes(path.sep) || path.isAbsolute(relative)) {
      throw new Error('Refusing to clean a web directory outside this invocation.');
    }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    for (const name of files) await copyFile(path.join(buildDirectory, name), path.join(directory, name));
    return { directory, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
