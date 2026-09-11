import { AgentError } from '@worknaru/runtime';

const terminal = new Set(['completed', 'failed', 'canceled', 'uncertain']);
export const initialAgentState = () => ({ version: 1, settings: { sendMode: 'queue', revision: 0 }, requests: [], paused: {}, creations: {} });
const fail = (code, message) => { throw new AgentError(code, message); };
function text(value, label, max = 65536) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid_input', `${label}을(를) 올바르게 입력해 주세요.`);
  return value;
}
function mode(value) { if (!['queue', 'steer'].includes(value)) fail('invalid_input', 'queue 또는 steer를 선택해 주세요.'); return value; }
function key(value) { const result = text(value, '요청 ID', 100); if (!/^[a-zA-Z0-9_-]+$/.test(result) || ['__proto__', 'constructor', 'prototype'].includes(result)) fail('invalid_input', '잘못된 요청 ID입니다.'); return result; }

/** Platform policy; persistence and the concrete execution driver are injected. */
export function createAgentService({ driver, store, validateDirectory, now = () => new Date().toISOString() }) {
  const state = store.load() ?? initialAgentState();
  if (state.version !== 1) fail('storage_version', '지원하지 않는 실행 데이터 버전입니다.');
  const locks = new Map(); const previews = new Map(); const watching = new Set();
  let stopped = false; let ready = false; let timer;
  const archiving = new Set();
  const save = () => { try { store.save(state); } catch { ready = false; fail('storage_unavailable', '대기열 저장소를 기록하지 못해 자동 실행을 멈췄습니다. 저장 공간을 확인한 뒤 개발 환경을 다시 시작해 주세요.'); } };
  const pause = id => { state.paused[id] = true; try { save(); } catch { /* fail closed */ } };
  const requests = id => state.requests.filter(r => r.agentId === id);
  const serial = (id, fn) => {
    const current = (locks.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
    locks.set(id, current);
    return current.finally(() => { if (locks.get(id) === current) locks.delete(id); });
  };
  const serialGroup = (ids, fn) => [...new Set(ids)].sort().reduceRight((next, id) => () => serial(id, next), fn)();
  async function get(id) { const value = await driver.get(id); if (!value) fail('not_found', 'Agent를 찾을 수 없습니다.'); return value; }
  async function resolve(selector) {
    text(selector, 'Agent'); const all = (await driver.list()).filter(a => a.managed);
    const exact = all.find(a => a.id === selector);
    if (exact) return exact;
    const candidates = all.filter(a => a.name === selector || (selector.length >= 4 && a.id.startsWith(selector)));
    if (candidates.length !== 1) fail(candidates.length ? 'ambiguous_agent' : 'not_found', candidates.length ? `Agent 이름이 겹칩니다. ID를 선택해 주세요: ${candidates.map(a => `${a.name} (${a.id})`).join(', ')}` : 'Agent를 찾을 수 없습니다. agent list를 확인해 주세요.');
    return candidates[0];
  }
  async function observe(id) {
    if (watching.has(id)) return;
    await driver.watch(id, event => {
      void serial(id, async () => {
        if (stopped) return;
        if (event.type === 'connection_lost' || event.type === 'replacement') {
          for (const r of requests(id).filter(r => ['sending', 'running'].includes(r.state))) {
            r.state = 'uncertain'; r.error = '연결 또는 대화 기록이 바뀌어 결과를 확인해야 합니다.'; state.paused[id] = true;
          }
          save();
        }
        if (event.type === 'timeline' && event.item?.type === 'user_message' && event.turnId) {
          const r = requests(id).find(r => r.id === (event.item.clientMessageId ?? event.item.messageId));
          if (r && !terminal.has(r.state)) { r.turnId = event.turnId; r.state = 'running'; save(); }
        }
        if (event.type === 'turn_started' && event.turnId) {
          for (const r of requests(id).filter(r => ['sending', 'running'].includes(r.state) && !r.turnId)) r.turnId = event.turnId;
          save();
        }
        if (['turn_completed', 'turn_failed', 'turn_canceled'].includes(event.type)) {
          for (const r of requests(id).filter(r => ['sending', 'running'].includes(r.state) && !r.turnId)) {
            r.state = 'uncertain'; r.error = '완료 이벤트와 요청의 턴을 연결하지 못했습니다. 기록을 확인해 주세요.'; state.paused[id] = true;
          }
          for (const r of requests(id).filter(r => !terminal.has(r.state) && r.state !== 'queued' && r.turnId === event.turnId)) {
            r.state = event.type === 'turn_completed' ? 'completed' : event.type === 'turn_failed' ? 'failed' : 'canceled';
            r.error = r.state === 'completed' ? null : '작업이 완료되지 않았습니다. 기록을 확인해 주세요.';
          }
          if (event.type !== 'turn_completed') state.paused[id] = true;
          save();
          if (event.type === 'turn_completed') schedule(id);
        }
      }).catch(() => pause(id));
    });
    watching.add(id);
  }
  function schedule(id) { if (!stopped && ready) void serial(id, () => dispatch(id)).catch(() => pause(id)); }
  async function dispatch(id) {
    if (stopped || !ready || state.paused[id]) return;
    const current = await get(id);
    if (current.archivedAt) { for (const r of requests(id).filter(r => r.state === 'queued')) r.state = 'canceled'; save(); return; }
    if (current.turnId || current.status === 'running' || current.permissions.length) return;
    if (requests(id).some(r => ['sending', 'running', 'uncertain'].includes(r.state))) return;
    const next = requests(id).find(r => r.state === 'queued');
    if (next) await transmit(current, next);
  }
  async function transmit(current, request) {
    await observe(current.id);
    request.state = 'sending'; save();
    try {
      await driver.send(current.id, request.text, request.id, request.mode);
      const after = await get(current.id);
      request.turnId ??= after.turnId;
      request.state = 'running'; save();
    } catch (error) {
      if (error.code === 'busy' && request.mode === 'queue') request.state = 'queued';
      else if (['archived', 'permission_pending', 'steer_unavailable', 'turn_changed'].includes(error.code)) {
        request.state = 'failed'; request.error = error.message;
      } else { request.state = 'uncertain'; request.error = '전송 결과를 확인할 수 없습니다. 자동으로 재전송하지 않습니다.'; state.paused[current.id] = true; }
      save();
    }
  }
  async function subtree(rootId) {
    const all = await driver.list(); const ids = new Set([rootId]);
    for (let changed = true; changed;) { changed = false; for (const a of all) if (a.parentId && ids.has(a.parentId) && !ids.has(a.id)) { ids.add(a.id); changed = true; } }
    return all.filter(a => ids.has(a.id));
  }
  const fingerprint = agents => JSON.stringify(agents.map(a => [a.id, a.turnId, a.archivedAt, a.permissions.map(p => p.id), requests(a.id).filter(r => r.state === 'queued').map(r => r.id)]).sort());
  async function execute(operation, raw) {
    const input = raw ?? {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_input', '잘못된 요청입니다.');
    if (operation === 'health') return { ready: ready && !stopped && (driver.connected?.() ?? true), version: 1 };
    if (!ready || stopped) fail('not_ready', 'Agent 실행부가 준비 중입니다. 잠시 후 다시 시도해 주세요.');
    if (operation === 'options') return driver.options(input.cwd);
    if (operation === 'directories') return driver.directories(text(input.query, '폴더', 4096));
    if (operation === 'settings') return { ...state.settings };
    if (operation === 'saveSettings') {
      if (input.revision !== state.settings.revision) fail('settings_conflict', '설정이 변경됐습니다. 다시 불러와 주세요.');
      state.settings = { sendMode: mode(input.sendMode), revision: state.settings.revision + 1 }; save(); return { ...state.settings };
    }
    if (operation === 'list') return (await driver.list()).filter(a => a.managed && (input.archived ? !!a.archivedAt : !a.archivedAt));
    if (operation === 'create') return serial('creation', async () => {
      key(input.id); text(input.name, '이름', 120); text(input.model, '모델', 300); text(input.cwd, '작업 폴더', 4096);
      await validateDirectory(input.cwd);
      const prior = state.creations[input.id]; const signature = JSON.stringify([input.name, input.cwd, input.model]);
      if (prior && prior.signature !== signature) fail('id_conflict', '같은 요청 ID의 생성 내용이 다릅니다.');
      if (prior?.agentId) return get(prior.agentId);
      if (prior) {
        const found = (await driver.list()).find(a => a.createId === input.id);
        if (found) { prior.agentId = found.id; save(); return found; }
        fail('creation_uncertain', '이전 생성 결과를 확정할 수 없습니다. Agent 목록을 확인해 주세요.');
      }
      const options = await driver.options(input.cwd);
      if (!options.models.some(m => m.id === input.model)) fail('invalid_model', '사용 가능한 Codex 모델을 선택해 주세요.');
      state.creations[input.id] = { signature, agentId: null }; save();
      const created = await driver.create(input); state.creations[input.id].agentId = created.id; save(); return created;
    });
    if (operation === 'archive') {
      const preview = previews.get(input.token);
      if (!preview || Date.now() > preview.expires) fail('preview_expired', '보관 대상을 다시 확인해 주세요.');
      return serialGroup(preview.ids, async () => {
        const all = await subtree(preview.root);
        if (fingerprint(all) !== preview.fingerprint) fail('archive_changed', '보관 영향이 변경됐습니다. 다시 확인해 주세요.');
        previews.delete(input.token);
        for (const a of all) { archiving.add(a.id); state.paused[a.id] = true; for (const r of requests(a.id)) if (r.state === 'queued') r.state = 'canceled'; }
        save();
        const archived = []; const failed = [];
        for (const a of all) {
          try { await driver.archive(a.id); const after = await get(a.id); if (!after.archivedAt || after.turnId || after.status === 'running' || after.permissions.length) throw Error(); archived.push(a.id); }
          catch { failed.push(a.id); }
        }
        for (const a of all) archiving.delete(a.id);
        return { archived, failed };
      });
    }
    const selected = await resolve(input.agent);
    if (operation === 'show') return get(selected.id);
    if (operation === 'history') return driver.history(selected.id, input.cursor);
    if (operation === 'requests') return { requests: requests(selected.id).map(r => ({ ...r })), paused: !!state.paused[selected.id] };
    if (operation === 'archivePreview') {
      for (const [token, preview] of previews) if (Date.now() > preview.expires) previews.delete(token);
      const agents = await subtree(selected.id); const token = crypto.randomUUID();
      previews.set(token, { root: selected.id, ids: agents.map(a => a.id), fingerprint: fingerprint(agents), expires: Date.now() + 120000 });
      return { token, agents, queued: agents.flatMap(a => requests(a.id).filter(r => r.state === 'queued')) };
    }
    return serial(selected.id, async () => {
      const current = await get(selected.id);
      if (current.archivedAt) fail('archived', '보관된 Agent는 기록만 조회할 수 있습니다.');
      if (operation === 'send') {
        if (archiving.has(current.id)) fail('archiving', '보관 중인 Agent에는 전송할 수 없습니다.');
        key(input.id); text(input.text, '메시지'); const chosen = input.mode === undefined ? state.settings.sendMode : mode(input.mode);
        const prior = state.requests.find(r => r.id === input.id);
        if (prior) { if (prior.agentId !== current.id || prior.text !== input.text || (input.mode && (prior.requestedMode ?? prior.mode) !== chosen)) fail('id_conflict', '같은 요청 ID에 다른 내용이 전달됐습니다.'); return { ...prior }; }
        if (chosen === 'steer' && (current.permissions.length || state.paused[current.id] || requests(current.id).some(r => r.state === 'queued'))) fail('steer_blocked', '권한 요청이나 앞선 대기열을 먼저 처리하거나 queue로 보내 주세요.');
        const effective = chosen === 'steer' && !current.turnId && current.status !== 'running' ? 'queue' : chosen;
        const request = { id: input.id, agentId: current.id, text: input.text, mode: effective, requestedMode: chosen, state: 'queued', turnId: null, createdAt: now(), error: null };
        state.requests.push(request); save(); await observe(current.id);
        if (effective === 'steer') await transmit(current, request); else schedule(current.id);
        return { ...request };
      }
      if (operation === 'cancel') {
        const r = requests(current.id).find(r => r.id === input.id);
        if (!r) fail('not_found', '대기 요청을 찾을 수 없습니다.');
        if (r.state !== 'queued') fail('not_queued', '아직 실행하지 않은 대기 메시지만 취소할 수 있습니다.');
        r.state = 'canceled'; save(); return { ...r };
      }
      if (operation === 'resume') {
        if (requests(current.id).some(r => r.state === 'uncertain')) fail('uncertain_request', '결과가 불명확한 요청이 있어 자동 실행을 재개할 수 없습니다. 기록과 상태를 확인해 주세요.');
        state.paused[current.id] = false; save(); schedule(current.id); return { resumed: true };
      }
      if (operation === 'discard') {
        const r = requests(current.id).find(r => r.id === input.id);
        if (!r || r.state !== 'uncertain') fail('not_uncertain', '결과가 불명확한 요청만 실행 포기 처리할 수 있습니다.');
        if (current.turnId || current.status === 'running' || current.permissions.length) fail('busy', '현재 작업이나 권한 요청을 먼저 처리해 주세요.');
        r.state = 'canceled'; r.error = '사용자가 기록 확인 후 자동 재실행을 포기했습니다.'; save(); return { ...r };
      }
      if (operation === 'permission') {
        if (!['allow', 'deny'].includes(input.behavior)) fail('invalid_input', '승인 또는 거부를 선택해 주세요.');
        const permission = current.permissions.find(p => p.id === input.id);
        if (!permission) fail('permission_resolved', '이미 처리됐거나 만료된 권한 요청입니다.');
        if (input.actionId && !permission.actions.some(a => a.id === input.actionId && a.behavior === input.behavior)) fail('invalid_input', '유효하지 않은 권한 선택입니다.');
        if (input.behavior === 'allow' && Array.isArray(permission.input?.questions)) {
          for (const question of permission.input.questions) text(input.answers?.answers?.[question.header], '질문 답변');
        }
        await driver.permission(current.id, input); return get(current.id);
      }
      fail('invalid_operation', '지원하지 않는 Agent 명령입니다.');
    });
  }
  return {
    health: input => execute('health', input),
    options: input => execute('options', input),
    directories: input => execute('directories', input),
    create: input => execute('create', input),
    list: input => execute('list', input),
    show: input => execute('show', input),
    history: input => execute('history', input),
    send: input => execute('send', input),
    requests: input => execute('requests', input),
    cancel: input => execute('cancel', input),
    discard: input => execute('discard', input),
    resume: input => execute('resume', input),
    permission: input => execute('permission', input),
    archivePreview: input => execute('archivePreview', input),
    archive: input => execute('archive', input),
    settings: input => execute('settings', input),
    saveSettings: input => execute('saveSettings', input),
    async initialize() {
      for (const r of state.requests) if (['sending', 'running'].includes(r.state)) { r.state = 'uncertain'; r.error = '재시작 전 요청 결과를 확인해야 합니다.'; state.paused[r.agentId] = true; }
      save();
      for (const id of new Set(state.requests.filter(r => !terminal.has(r.state)).map(r => r.agentId))) await observe(id);
      ready = true;
      timer = setInterval(() => { for (const id of new Set(state.requests.filter(r => r.state === 'queued').map(r => r.agentId))) schedule(id); }, 2000);
      for (const id of new Set(state.requests.filter(r => r.state === 'queued').map(r => r.agentId))) schedule(id);
    },
    async close() { stopped = true; clearInterval(timer); await Promise.allSettled([...locks.values()]); try { if (ready) save(); } finally { try { await driver.close(); } finally { store.close(); } } },
  };
}
