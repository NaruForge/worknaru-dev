// In-memory build reuse for one isolated verification run, never a CLI option.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, samePath } from '../../../packages/dev-environment/paths.mjs';
import { setupAgents } from '../agent-setup.mjs';
import { buildDevelopment, localPaths, start } from '../local.mjs';
import { LocalError } from '../local-support.mjs';

const ignored = new Set(['node_modules', '.git', '.local', 'storybook-static', 'test-results', 'playwright-report']);
const requiredOutputs = [
  'apps/cli/dist/main.js', 'apps/cli/dist/bootstrap.js',
  'apps/web/dist/index.html', 'apps/web/dist/app.js', 'apps/web/dist/styles.css',
  'packages/branding/dist/index.js', 'packages/runtime/dist/index.js',
  'packages/core/dist/index.js', 'packages/paseo-adapter/dist/index.js',
];

async function snapshot(repository, environment) {
  const inputs = createHash('sha256');
  const outputs = createHash('sha256');
  const outputFiles = new Set();
  const add = async (relative, generated) => {
    const digest = createHash('sha256').update(await readFile(path.join(repository, relative))).digest('hex');
    (generated ? outputs : inputs).update(JSON.stringify([relative, digest]));
    if (generated) outputFiles.add(relative);
  };
  const walk = async (relative, generated = false) => {
    const entries = await readdir(path.join(repository, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (relative || ['apps', 'packages'].includes(entry.name)) await walk(file, generated || entry.name === 'dist');
      } else if (entry.isFile()) await add(file, generated);
      else throw new LocalError('verification_build_changed', 'Verification build inputs contain an unsupported link. Start a fresh verification run after inspecting the checkout.');
    }
  };
  await walk('');
  // Lockfiles and workspace manifests are covered above. Include pnpm's installed
  // dependency metadata too, so an install during the run invalidates the proof.
  for (const file of ['node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml', 'node_modules/.pnpm-workspace-state-v1.json']) {
    try { await add(file, false); }
    catch (error) { if (error.code !== 'ENOENT') throw error; inputs.update(JSON.stringify([file, null])); }
  }
  inputs.update(JSON.stringify([process.execPath, process.versions, Object.entries(environment()).sort(([a], [b]) => a.localeCompare(b))]));
  return { inputs: inputs.digest('hex'), outputs: outputs.digest('hex'), complete: requiredOutputs.every(file => outputFiles.has(file)) };
}

export function verificationBuild({ repository = root, runBuild = buildDevelopment, environment = () => process.env } = {}) {
  let verified;
  let builds = 0;
  const build = async paths => {
    if (!samePath(paths.repository, repository)) throw new LocalError('verification_build_changed', 'Verification build belongs to a different checkout.');
    const before = await snapshot(repository, environment);
    if (verified) {
      if (!before.complete || before.inputs !== verified.inputs || before.outputs !== verified.outputs) {
        throw new LocalError('verification_build_changed', 'Source, configuration, installed dependency metadata or built files changed during verification. Start a fresh verification run.');
      }
      return;
    }
    await runBuild(paths);
    const after = await snapshot(repository, environment);
    if (!after.complete || before.inputs !== after.inputs) {
      throw new LocalError('verification_build_changed', 'Build inputs changed or required output files are missing. Start a fresh verification run.');
    }
    verified = after;
    builds++;
  };
  return { build, get builds() { return builds; } };
}

export function verificationEnvironment(env) {
  const paths = localPaths(env);
  const proof = verificationBuild();
  // Keep the isolated child environment fixed for the entire run. Build commands
  // use the parent environment, which is included in the proof on every call.
  const childEnv = Object.freeze({ ...env });
  return {
    setup: () => setupAgents(paths, { build: proof.build }),
    start: () => start(paths, { build: proof.build, env: childEnv }),
    get builds() { return proof.builds; },
  };
}
