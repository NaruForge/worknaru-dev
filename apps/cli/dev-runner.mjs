// The detached controller retains the actual child handle. Later CLI invocations
// never use a saved PID to kill a process.
import assert from 'node:assert/strict';
import { Console } from 'node:console';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { startDedicatedDaemon, listen, endpoint } from '../../packages/dev-environment/daemon.mjs';
import { acquireLock, assertStorage } from '../../packages/dev-environment/storage.mjs';
import { prepareDataDirectories } from '../../packages/dev-environment/paths.mjs';
import { agentConfig, agentsEnabled } from '../../packages/dev-environment/config.mjs';
import { resetData, resetPlan } from './data-reset.mjs';
import { createDataManagement } from './data-management.mjs';
import { root } from '../../packages/dev-environment/paths.mjs';
import { localPaths } from './local.mjs';
import { pipeFor, removeOwner } from './local-support.mjs';
import { createCore } from './dist/bootstrap.js';

let paths = localPaths();
let management; let resetting = false;
const abort = new AbortController();
let owner; let daemon; let server; let stopPromise;
let state = 'starting'; let pidRecord; let serverId;
const initialConsole = console;
let runnerOutput;
const sockets = new Set();
const closeServer = () => { server?.close(); for (const socket of sockets) socket.end(); runnerOutput?.end(); };
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
  paths = { ...paths, source: message.source === 'default' ? 'default' : 'WORKNARU_DATA_DIR' };
  owner = { ...message.owner, controllerPid: process.pid };
  management = createDataManagement({ paths, serverId: () => serverId, verifyOwner,
    async listAgents() {
      const core = createCore({ targetId: 'worknaru-dev', endpoint, expectedServerId: serverId, timeoutMs: 5000 });
      return [...await core.agents.list({}), ...await core.agents.list({ archived: true })];
    }, restart: queueReset });
  assert.equal(owner.repository, root);
  assert.equal(owner.dataRoot, paths.dataHome);
  assert.match(owner.token, /^[a-f0-9-]{36}$/);
  server = net.createServer(socket => {
    socket.setEncoding('utf8');
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
        if (input.token !== owner.token || !['status', 'stop', 'data.snapshot', 'data.open', 'data.preview', 'data.reset'].includes(input.command)) return socket.destroy();
        if (input.command.startsWith('data.')) {
          if (input.input?.serverId !== serverId) throw Error('Server identity differs');
          let data;
          try { data = { ok: true, value: await management[input.command.slice(5)](input.input) }; }
          catch (error) { data = { ok: false, error: { code: error.code ?? 'management_failed', message: error.code ? error.message : '데이터 관리 요청을 처리하지 못했습니다. doctor로 확인해 주세요.' } }; }
          socket.end(`${JSON.stringify({ ...owner, data })}\n`);
          return;
        }
        if (input.command === 'stop' && state === 'running' && !resetting) await stop();
        socket.end(`${JSON.stringify({ ...owner, state, serverId, pidRecord })}\n`);
        if (input.command === 'stop' && state === 'stopped' && !resetting) closeServer();
      } catch (error) {
        console.error(error);
        socket.end(`${JSON.stringify({ ...owner, state: 'failed' })}\n`);
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipeFor(owner.token), resolve); });
  await writeFile(paths.record, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
  await launchDaemon();
  if (process.connected) process.send({ ready: true, token: owner.token });
}
async function launchDaemon() {
  daemon = await startDedicatedDaemon({ paths, storageLocked: true, webDist: path.join(root, 'apps/web/dist'), signal: abort.signal });
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
  const launched = daemon;
  launched.exited.then(async () => {
    if (daemon !== launched || state !== 'running' || resetting) return;
    state = 'failed'; console.error('Dedicated daemon exited unexpectedly.');
    await daemon.cleanup(); await removeOwner(paths, owner); closeServer();
  }).catch(error => { console.error(error); closeServer(); process.exitCode = 1; });
}

async function verifyOwner() {
  await assertStorage(paths, { ignoreLock: true });
  assert.equal(state, 'running', 'Controller is not running');
  assert.equal(resetting, false, 'Reset is already running');
  const current = JSON.parse(await readFile(paths.record, 'utf8'));
  assert.deepEqual(current, owner, 'Controller owner changed');
  assert.equal(await readFile(paths.pid, 'utf8'), pidRecord, 'Daemon PID record changed');
  assert.equal((await readFile(paths.serverId, 'utf8')).trim(), serverId, 'Daemon identity changed');
}
async function queueReset(id) {
  assert.match(id, /^[a-f0-9-]{36}$/);
  const release = await acquireLock(paths.lock);
  try {
    await verifyOwner();
    const plan = await resetPlan(paths, { ignoreLock: true, stopped: verifyOwner });
    if (plan.blockers.length) throw Object.assign(new Error(plan.blockers[0].message), { code: plan.blockers[0].code });
    const enableAgents = await agentsEnabled(paths);
    resetting = true;
    // Let the existing RPC acknowledge acceptance before its daemon is shut down.
    setTimeout(() => void (async () => {
      let completed = false;
      try {
        await stop();
        globalThis.console = initialConsole;
        if (runnerOutput) await new Promise(resolve => runnerOutput.end(resolve));
        runnerOutput = undefined;
        await resetData(paths, { lockHeld: true });
        await assertStorage(paths, { claim: true, ignoreLock: true });
        await prepareDataDirectories(paths);
        runnerOutput = createWriteStream(paths.runnerLog, { flags: 'wx' });
        await new Promise((resolve, reject) => { runnerOutput.once('open', resolve); runnerOutput.once('error', reject); });
        globalThis.console = new Console({ stdout: runnerOutput, stderr: runnerOutput });
        if (enableAgents) await writeFile(paths.config, JSON.stringify(agentConfig(paths), null, 2) + '\n', { flag: 'wx' });
        await writeFile(paths.record, JSON.stringify(owner), { flag: 'wx', mode: 0o600 });
        stopPromise = undefined;
        state = 'starting';
        await launchDaemon();
        management.complete();
        completed = true;
      } catch (error) {
        console.error('Data reset/restart failed:', error.code ?? error.message);
        // Keep a live daemon manageable if shutdown itself failed. Never restart after failed deletion.
        if (state !== 'running') {
          state = 'failed';
          await daemon?.cleanup().catch(() => {});
          await removeOwner(paths, owner).catch(() => {});
          closeServer();
        }
      } finally { await release(); resetting = false; }
      // Publish completion only after readiness and releasing the operation lock.
      if (completed) await writeFile(path.join(daemon.webDirectory, 'connection.json'), JSON.stringify({ targetId: 'worknaru-dev', expectedServerId: serverId, completedResetId: id }));
    })(), 500);
  } catch (error) { await release(); throw error; }
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
  else if (state === 'running' && !resetting) stop().then(closeServer).catch(error => { console.error(error); process.exitCode = 1; });
});
