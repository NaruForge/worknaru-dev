import type { DaemonStatus, WorknaruCore } from '@worknaru/core';
import { CliError, help, parseCommand } from './arguments.js';
import type { DaemonConfiguration, Environment } from './arguments.js';

export interface CliOutput {
  stdout(text: string): void;
  stderr(text: string): void;
}

function formatStatus(status: DaemonStatus): string {
  const lines = [
    `Daemon: ${status.outcome}`,
    `Target: ${status.target.id}`,
    `Endpoint: ${status.target.endpoint}`,
    `Expected server: ${status.target.expectedServerId}`,
    `Server: ${status.server?.id ?? 'unknown'}`,
    `Version: ${status.server?.version ?? 'unknown'}`,
    `Connection at check: ${status.connection}`,
    `Local process: ${status.localProcess}`,
    `Checked at: ${status.checkedAt}`,
  ];
  if (status.failure) lines.push(`Failure: ${status.failure.code} (${status.failure.stage})`, status.failure.message);
  return `${lines.join('\n')}\n`;
}

/** Command handling knows only Core, never an adapter or provider SDK. */
export async function runCli(
  args: readonly string[], env: Environment, output: CliOutput,
  createCore: (configuration: DaemonConfiguration) => WorknaruCore,
): Promise<number> {
  try {
    const command = parseCommand(args, env);
    if (command.kind === 'help') {
      output.stdout(help);
      return 0;
    }
    const core = createCore(command.configuration);
    const status = await core.getDaemonStatus();
    output.stdout(command.json ? `${JSON.stringify(status)}\n` : formatStatus(status));
    return status.outcome === 'available' ? 0 : 1;
  } catch (error) {
    const known = error instanceof CliError;
    const detail = known
      ? { code: error.code, message: error.message }
      : { code: 'internal_error', message: 'Worknaru could not complete the command.' };
    // Preserve JSON mode even when parsing or configuration fails. Never echo
    // argument values, credentials, stack traces or unexpected exception text.
    if (args.includes('--json')) output.stdout(`${JSON.stringify({ error: detail })}\n`);
    else output.stderr(`${detail.code}: ${detail.message}\n`);
    return known ? 2 : 3;
  }
}
