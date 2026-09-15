import { inspect, localPaths } from './local.mjs';
import { LocalError } from './local-support.mjs';
import { endpoint } from '../../packages/dev-environment/config.mjs';

/** App-only connection configuration shared by product commands. */
export async function productConfiguration(options, env, readLocal = () => inspect(localPaths(env))) {
  const flags = ['--endpoint', '--server-id', '--target', '--timeout-ms'];
  const args = flags.flatMap(flag => Object.hasOwn(options, flag) ? [flag, options[flag]] : []);
  if (args.length || ['ENDPOINT', 'SERVER_ID', 'TARGET_ID', 'TIMEOUT_MS', 'PASSWORD'].some(key => env[`WORKNARU_${key}`] !== undefined)) {
    const { parseCommand } = await import('./dist/arguments.js');
    return parseCommand(['status', ...args], env).configuration;
  }
  const current = await readLocal();
  if (current.state !== 'running') throw new LocalError('not_running', '먼저 pnpm exec worknaru dev start를 실행해 주세요.');
  return { targetId: 'worknaru-dev', endpoint, expectedServerId: current.serverId, timeoutMs: 5000 };
}
