import { doctor, localPaths, localStatus, start, stop } from './local.mjs';
import { LocalError } from './local-support.mjs';

const connectionFlags = ['--endpoint', '--server-id', '--target', '--timeout-ms'];
const connectionKeys = ['WORKNARU_ENDPOINT', 'WORKNARU_SERVER_ID', 'WORKNARU_TARGET_ID', 'WORKNARU_TIMEOUT_MS', 'WORKNARU_PASSWORD'];
export const explicitTarget = (args, env) => connectionFlags.some(flag => args.includes(flag)) || connectionKeys.some(key => env[key] !== undefined);
export const helpText = name => `${name} CLI

Usage (from the repository, after pnpm install --frozen-lockfile):
  pnpm exec worknaru doctor          Diagnose without changing files or processes
  pnpm exec worknaru dev start       Build and start Daemon + Web UI in background
  pnpm exec worknaru status          Check this development environment
  pnpm exec worknaru dev stop        Stop the owned development environment

Use --json for one JSON document; --help or -h for help.
Windows, one local environment at http://127.0.0.1:6868/.
WORKNARU_DATA_DIR selects its data root. No global install is required.
Start reuses a healthy instance. Stop is safe to repeat. Doctor never repairs.

Advanced status (flags override their corresponding environment variables):
  worknaru status --endpoint <ws/wss-url> --server-id <id> [options]
  --endpoint <url>    WORKNARU_ENDPOINT
  --server-id <id>    WORKNARU_SERVER_ID
  --target <id>       WORKNARU_TARGET_ID; default: worknaru
  --timeout-ms <ms>   WORKNARU_TIMEOUT_MS; default: 5000; range: 1..300000
  Password: WORKNARU_PASSWORD only.
Any explicit connection setting requires the endpoint/server-ID pair.
No missing explicit setting is filled from local development state.
Exit codes: 0 success/healthy/help, 1 unavailable/check/operation failure,
            2 invalid arguments/configuration, 3 unexpected error.
`;

function parseLocal(args) {
  const command = args[0] === 'dev' ? `dev ${args[1] ?? ''}` : args[0];
  const known = ['doctor', 'status', 'dev start', 'dev stop', 'dev --help', 'dev -h'];
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return 'help';
  if (!known.includes(command)) throw new LocalError('invalid_arguments', 'Unknown command. Use pnpm exec worknaru --help.', 2);
  const options = args.slice(args[0] === 'dev' ? 2 : 1);
  if (new Set(options).size !== options.length || options.some(option => !['--json', '--help', '-h'].includes(option))) {
    throw new LocalError('invalid_arguments', 'Unknown or repeated option. Use pnpm exec worknaru --help.', 2);
  }
  return command.includes('--help') || command.includes('-h') || options.some(option => ['--help', '-h'].includes(option)) ? 'help' : command;
}
export async function run(args, env, output = { stdout: text => process.stdout.write(text), stderr: text => process.stderr.write(text) }) {
  try {
    const simpleStatusHelp = args[0] === 'status' && args.slice(1).some(value => ['--help', '-h'].includes(value))
      && args.slice(1).every(value => ['--help', '-h', '--json'].includes(value));
    const explicit = args[0] === 'status' && explicitTarget(args, env) && !simpleStatusHelp;
    if (explicit) {
      let modules;
      try { modules = await Promise.all([import('./dist/cli.js'), import('./dist/bootstrap.js')]); }
      catch { throw new LocalError('build_required', 'Status dependencies are not built or installed. Run pnpm install --frozen-lockfile, then pnpm build.'); }
      return modules[0].runCli(args, env, output, modules[1].createCore);
    }
    const command = parseLocal(args);
    if (command === 'help') {
      let name = 'Worknaru';
      try { name = (await import('../../packages/branding/dist/index.js')).brand.displayName; } catch { /* pre-build bootstrap label */ }
      output.stdout(helpText(name)); return 0;
    }
    if (command.startsWith('dev ') && explicitTarget([], env)) {
      throw new LocalError('invalid_configuration', 'Development commands use WORKNARU_DATA_DIR. Unset explicit WORKNARU connection settings before managing the local environment.', 2);
    }
    const paths = localPaths(env);
    if (command === 'dev start' && !args.includes('--json')) output.stderr('Checking development environment; a stopped environment is built before startup...\n');
    const result = await ({ doctor, status: localStatus, 'dev start': start, 'dev stop': stop }[command])(paths);
    if (args.includes('--json')) output.stdout(`${JSON.stringify(result)}\n`);
    else if (command === 'doctor') output.stdout(`${result.checks.map(check => `${check.ok ? 'OK' : 'CHECK'} ${check.name}: ${check.detail}${!check.ok && check.next ? `\n  Next: ${check.next}` : ''}`).join('\n')}\n`);
    else {
      output.stdout(`Development: ${result.state}${result.reused ? ' (reused)' : ''}\nData root: ${result.dataRoot}\n`);
      if (result.state === 'running') output.stdout(`Web UI: ${result.webUrl}\n`);
      if (result.daemon?.failure) output.stdout(`Failure: ${result.daemon.failure.code}: ${result.daemon.failure.message}\n`);
      output.stdout(`Next: ${result.next}\n`);
    }
    return command === 'doctor' ? (result.ok ? 0 : 1) : (result.state === 'running' || (command === 'dev stop' && result.state === 'stopped') ? 0 : 1);
  } catch (error) {
    const known = error instanceof LocalError;
    const detail = { code: known ? error.code : 'internal_error', message: known ? error.message : 'Cannot complete the command. Run pnpm exec worknaru doctor and inspect the data root logs.' };
    if (args.includes('--json')) output.stdout(`${JSON.stringify({ error: detail })}\n`);
    else output.stderr(`${detail.code}: ${detail.message}\n`);
    return known ? error.exitCode : 3;
  }
}
