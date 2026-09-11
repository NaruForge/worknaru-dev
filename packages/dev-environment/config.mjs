import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

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
    return isDeepStrictEqual(JSON.parse(await readFile(paths.config, 'utf8')), expectedConfig(paths)) ? 'valid' : 'conflict';
  } catch (error) { return error.code === 'ENOENT' ? 'absent' : 'conflict'; }
}
