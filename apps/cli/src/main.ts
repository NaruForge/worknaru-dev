import { createCore } from './bootstrap.js';
import { runCli } from './cli.js';

process.exitCode = await runCli(process.argv.slice(2), process.env, {
  stdout: text => { process.stdout.write(text); },
  stderr: text => { process.stderr.write(text); },
}, createCore);
