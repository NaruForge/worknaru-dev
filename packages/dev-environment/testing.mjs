import { mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { actualPath, containsPath, root, validateExecutionPath } from './paths.mjs';

export async function testDirectory(prefix, env = process.env) {
  const base = env.WORKNARU_TEST_ROOT ?? path.join(os.tmpdir(), 'worknaru-tests');
  try {
    validateExecutionPath(base, 'WORKNARU_TEST_ROOT');
    const actual = await actualPath(base);
    validateExecutionPath(actual, 'Actual WORKNARU_TEST_ROOT');
    if (containsPath(root, actual) || containsPath(actual, root)) throw Error('Test root overlaps checkout');
  } catch (error) { throw new Error('Choose an external ASCII/no-space WORKNARU_TEST_ROOT. ' + error.message); }
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, prefix + '-'));
}
