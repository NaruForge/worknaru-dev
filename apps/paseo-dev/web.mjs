import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { listen, root, startDedicatedDaemon } from './daemon.mjs';
import { brand } from '@worknaru/branding';

const webDist = path.join(root, 'apps', 'web', 'dist');

async function main() {
  let requestStop;
  const stopRequested = new Promise(resolve => { requestStop = resolve; });
  const onStop = () => requestStop();
  process.on('SIGINT', onStop);
  process.on('SIGTERM', onStop);
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', line => { if (line.trim().toLowerCase() === 'stop') requestStop(); });
  input.on('close', onStop);
  let daemon;
  try {
    daemon = await startDedicatedDaemon({ webDist });
    assert.ok(daemon.webDirectory, 'Dedicated web directory is missing');
    await writeFile(path.join(daemon.webDirectory, 'connection.json'), `${JSON.stringify({
      targetId: 'worknaru-dev', expectedServerId: daemon.connection.info.serverId,
    }, null, 2)}\n`);
    await daemon.connection.driver.close();
    console.log(`${brand.displayName} Web UI: http://${listen}/`);
    console.log('Press Ctrl+C, or type stop and Enter, to stop this dedicated daemon.');
    await Promise.race([
      stopRequested,
      daemon.exited.then(() => { throw new Error('Dedicated daemon exited while serving the Web UI.'); }),
    ]);
    await daemon.stop();
    console.log('Dedicated daemon stopped.');
  } finally {
    input.close();
    process.off('SIGINT', onStop);
    process.off('SIGTERM', onStop);
    await daemon?.cleanup();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
