// The detached controller retains the actual child handle. Later CLI invocations
// never use a saved PID to kill a process.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { startDedicatedDaemon, listen, endpoint } from '../../packages/dev-environment/daemon.mjs';
import { root } from '../../packages/dev-environment/paths.mjs';
import { localPaths } from './local.mjs';
import { pipeFor, removeOwner } from './local-support.mjs';
import { createCore } from './dist/bootstrap.js';

const paths = localPaths();
const abort = new AbortController();
let owner; let daemon; let server; let stopPromise;
let state = 'starting'; let pidRecord; let serverId;
const sockets = new Set();
const closeServer = () => { server?.close(); for (const socket of sockets) socket.end(); };
async function stop() {
  return stopPromise ??= (async () => {
    state = 'stopping';
    assert.equal(await readFile(paths.pid, 'utf8'), pidRecord, 'Daemon PID record changed');
    assert.equal((await readFile(paths.serverId, 'utf8')).trim(), serverId, 'Daemon identity changed');
    await daemon.stop();
    await daemon.cleanup();
    await removeOwner(paths, owner);
    state = 'stopped';
  })().catch(error => {
    state = 'running'; stopPromise = undefined;
    throw error;
  });
}
async function start(message) {
  owner = message.owner;
  assert.equal(owner.repository, root);
  assert.equal(owner.dataRoot, paths.dataHome);
  assert.match(owner.token, /^[a-f0-9-]{36}$/);
  server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {}); socket.setTimeout(45000, () => socket.destroy());
    let text = ''; let handled = false;
    socket.on('data', async data => {
      if (handled) return;
      text += data;
      if (text.length > 4096) return socket.destroy();
      if (!text.includes('\n')) return;
      handled = true;
      try {
        const input = JSON.parse(text.split('\n')[0]);
        if (input.token !== owner.token || !['status', 'stop'].includes(input.command)) return socket.destroy();
        if (input.command === 'stop' && state === 'running') await stop();
        socket.end(`${JSON.stringify({ ...owner, state, serverId, pidRecord })}\n`);
        if (state === 'stopped') closeServer();
      } catch (error) {
        console.error(error);
        socket.end(`${JSON.stringify({ ...owner, state: 'failed' })}\n`);
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipeFor(owner.token), resolve); });
  await writeFile(paths.record, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
  daemon = await startDedicatedDaemon({ paths, webDist: path.join(root, 'apps/web/dist'), signal: abort.signal });
  serverId = daemon.connection.info.serverId;
  pidRecord = await readFile(paths.pid, 'utf8');
  await writeFile(path.join(daemon.webDirectory, 'connection.json'), JSON.stringify({ targetId: 'worknaru-dev', expectedServerId: serverId }));
  await daemon.connection.driver.close();
  abort.signal.throwIfAborted();
  const status = await createCore({ targetId: 'worknaru-dev', endpoint, expectedServerId: serverId, timeoutMs: 5000 }).getDaemonStatus();
  assert.equal(status.outcome, 'available', 'Core readiness failed');
  for (const file of ['index.html', 'app.js', 'styles.css', 'connection.json']) {
    const response = await fetch(`http://${listen}/${file === 'index.html' ? '' : file}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, `Web readiness failed: ${file}`);
    // Paseo injects its own connection bootstrap into index.html.
    const actual = (await response.text()).replace(/<script>window\.__PASEO_INITIAL_DAEMON_CONNECTION__=.*?<\/script>/, '');
    assert.equal(actual, await readFile(path.join(daemon.webDirectory, file), 'utf8'), `Web content differs: ${file}`);
  }
  abort.signal.throwIfAborted();
  state = 'running';
  if (process.connected) process.send({ ready: true, token: owner.token });
  daemon.exited.then(async () => {
    if (state !== 'running') return;
    state = 'failed'; console.error('Dedicated daemon exited unexpectedly.');
    await daemon.cleanup(); await removeOwner(paths, owner); closeServer();
  }).catch(error => { console.error(error); closeServer(); process.exitCode = 1; });
}

let started = false;
process.on('message', message => {
  if (message?.command === 'cancel') abort.abort();
  if (message?.command !== 'start' || started) return;
  started = true;
  start(message).catch(async error => {
    state = 'failed'; console.error(error);
    try {
      if (daemon) { try { await daemon.stop(); } catch { /* cleanup retains the actual child handle */ } }
      await daemon?.cleanup(); await removeOwner(paths, owner);
    }
    catch (cleanupError) { console.error(cleanupError); }
    if (process.connected) process.send({ ready: false, token: owner?.token }, () => { if (process.connected) process.disconnect(); });
    closeServer(); process.exitCode = 1;
  });
});
process.on('disconnect', () => { if (state === 'starting') abort.abort(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (state === 'starting') abort.abort();
  else if (state === 'running') stop().then(closeServer).catch(error => { console.error(error); process.exitCode = 1; });
});
