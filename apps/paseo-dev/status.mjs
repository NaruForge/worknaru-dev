import { readFile } from 'node:fs/promises';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';

// Direct adapter probe for development. Product commands use apps/cli and Core.
try {
  const expectedServerId = (await readFile(new URL('../../.local/paseo-dev/server-id', import.meta.url), 'utf8')).trim();
  const runtime = createPaseoRuntime({
    targetId: 'worknaru-dev', endpoint: 'ws://127.0.0.1:6868/ws', expectedServerId,
  });
  const status = await runtime.getDaemonStatus();
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.outcome === 'available' ? 0 : 1;
} catch {
  console.error('Dedicated Paseo status configuration is unavailable. Check .local/paseo-dev/server-id and the development setup.');
  process.exitCode = 1;
}
