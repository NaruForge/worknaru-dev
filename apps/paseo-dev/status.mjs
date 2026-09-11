import { readFile } from 'node:fs/promises';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';
import { describeDataPaths, resolveDataPaths } from './paths.mjs';

// Direct adapter probe for development. Product commands use apps/cli and Core.
try {
  const paths = resolveDataPaths();
  console.error(describeDataPaths(paths));
  const expectedServerId = (await readFile(paths.serverId, 'utf8')).trim();
  const runtime = createPaseoRuntime({
    targetId: 'worknaru-dev', endpoint: 'ws://127.0.0.1:6868/ws', expectedServerId,
  });
  const status = await runtime.getDaemonStatus();
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.outcome === 'available' ? 0 : 1;
} catch (error) {
  console.error(`Dedicated Paseo status configuration is unavailable: ${error.message}`);
  process.exitCode = 1;
}
