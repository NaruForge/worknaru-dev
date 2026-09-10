import { createWorknaruCore } from '@worknaru/core';
import { createPaseoRuntime } from '@worknaru/paseo-adapter';

/** The development launcher writes public target metadata after verifying its daemon. */
export async function loadCore() {
  const response = await fetch('./connection.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Connection configuration is unavailable.');
  const configuration: unknown = await response.json();
  if (!configuration || typeof configuration !== 'object'
    || !('targetId' in configuration) || typeof configuration.targetId !== 'string'
    || !('expectedServerId' in configuration) || typeof configuration.expectedServerId !== 'string') {
    throw new Error('Connection configuration is invalid.');
  }
  const endpoint = new URL('/ws', window.location.href);
  endpoint.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const runtime = createPaseoRuntime({
    targetId: configuration.targetId,
    endpoint: endpoint.href,
    expectedServerId: configuration.expectedServerId,
    clientType: 'browser',
  });
  return { core: createWorknaruCore({ runtime }), endpoint: endpoint.href };
}
