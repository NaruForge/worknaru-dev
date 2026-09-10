export type Environment = Readonly<Record<string, string | undefined>>;

export interface DaemonConfiguration {
  readonly targetId: string;
  readonly endpoint: string;
  readonly expectedServerId: string;
  readonly timeoutMs: number;
  readonly password?: string;
}

export class CliError extends Error {
  constructor(readonly code: 'invalid_arguments' | 'invalid_configuration', message: string) {
    super(message);
  }
}

export const help = `Worknaru CLI

Usage:
  worknaru status [options]
  worknaru --help

Options (flags override the corresponding environment variable):
  --endpoint <url>    Daemon ws/wss URL         WORKNARU_ENDPOINT
  --server-id <id>    Expected daemon ID        WORKNARU_SERVER_ID
  --target <id>       Target label (worknaru)   WORKNARU_TARGET_ID
  --timeout-ms <ms>   Total probe timeout       WORKNARU_TIMEOUT_MS
                     Default: 5000; range: 1..300000
  --json             One JSON document on stdout
  --help, -h         Show this help

Endpoint and server ID are required. Password: WORKNARU_PASSWORD only.
No daemon is started, stopped or automatically discovered.
Exit codes: 0 available/help, 1 unavailable, 2 invalid input/config, 3 internal error.
`;

const valueOptions = new Set(['--endpoint', '--server-id', '--target', '--timeout-ms']);

export type Command = { readonly kind: 'help' } | {
  readonly kind: 'status';
  readonly json: boolean;
  readonly configuration: DaemonConfiguration;
};

export function parseCommand(args: readonly string[], env: Environment): Command {
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]!))) return { kind: 'help' };
  if (args[0] !== 'status') throw new CliError('invalid_arguments', 'Unknown command. Use worknaru --help.');
  const values = new Map<string, string>();
  const seen = new Set<string>();
  for (let i = 1; i < args.length; i++) {
    const option = args[i]!;
    if (seen.has(option)) throw new CliError('invalid_arguments', 'An option was supplied more than once.');
    seen.add(option);
    if (['--json', '--help', '-h'].includes(option)) continue;
    if (!valueOptions.has(option)) throw new CliError('invalid_arguments', 'Unknown option. Use worknaru status --help.');
    const value = args[++i];
    if (value === undefined || !value.trim() || value.startsWith('-')) {
      throw new CliError('invalid_arguments', 'An option is missing its value.');
    }
    values.set(option, value.trim());
  }
  if (seen.has('--help') || seen.has('-h')) return { kind: 'help' };
  const resolve = (flag: string, key: string) => values.get(flag) ?? env[key]?.trim();
  const endpoint = resolve('--endpoint', 'WORKNARU_ENDPOINT');
  const expectedServerId = resolve('--server-id', 'WORKNARU_SERVER_ID');
  if (!endpoint || !expectedServerId) {
    throw new CliError('invalid_configuration', 'Provide a daemon endpoint and expected server ID using flags or WORKNARU_ENDPOINT and WORKNARU_SERVER_ID.');
  }
  const targetId = resolve('--target', 'WORKNARU_TARGET_ID') ?? 'worknaru';
  if (!targetId) throw new CliError('invalid_configuration', 'The target label must not be empty.');
  const timeout = resolve('--timeout-ms', 'WORKNARU_TIMEOUT_MS') ?? '5000';
  if (!/^\d+$/.test(timeout) || Number(timeout) < 1 || Number(timeout) > 300000) {
    throw new CliError('invalid_configuration', 'The timeout must be an integer between 1 and 300000 milliseconds.');
  }
  const password = env.WORKNARU_PASSWORD;
  if (password !== undefined && password.length === 0) {
    throw new CliError('invalid_configuration', 'WORKNARU_PASSWORD must be non-empty when set.');
  }
  return {
    kind: 'status', json: seen.has('--json'),
    configuration: {
      targetId, endpoint, expectedServerId, timeoutMs: Number(timeout),
      ...(password === undefined ? {} : { password }),
    },
  };
}
