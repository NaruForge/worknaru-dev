import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

export function agentConfig(paths) {
  return { ...expectedConfig(paths), pluginsEnabled: true,
    plugins: { 'worknaru-agent-service': { source: 'directory', path: fileURLToPath(new URL('../../apps/agent-service/', import.meta.url)).replace(/[\\/]$/, ''), enabled: true } } };
}
export async function agentsEnabled(paths) {
  try { return isDeepStrictEqual(JSON.parse(await readFile(paths.config, 'utf8')), agentConfig(paths)); } catch { return false; }
}

export const listen = '127.0.0.1:6868';
export const endpoint = `ws://${listen}/ws`;
export const version = '0.8.0';

export function expectedConfig(paths) {
  return {
    version: 1,
    daemon: {
      listen, relay: { enabled: false }, mcp: { enabled: false, injectIntoAgents: false },
      browserTools: { enabled: false }, serviceProxy: { enabled: false },
    },
    pluginsEnabled: false, worktrees: { root: paths.worktrees },
    features: { dictation: { enabled: false }, voiceMode: { enabled: false }, webUi: { enabled: false } },
    log: { file: { path: paths.log } },
  };
}

export async function configState(paths) {
  try {
    const actual = JSON.parse(await readFile(paths.config, 'utf8'));
    return isDeepStrictEqual(actual, expectedConfig(paths)) || isDeepStrictEqual(actual, agentConfig(paths)) ? 'valid' : 'conflict';
  } catch (error) { return error.code === 'ENOENT' ? 'absent' : 'conflict'; }
}
