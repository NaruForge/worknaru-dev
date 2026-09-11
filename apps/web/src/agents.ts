import { AgentError, conversationMessages, type WorknaruCore, type Agent, type AgentHistory, type AgentSettings, type ArchivePreview, type SendMode } from '@worknaru/core';

function el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') { const value = document.createElement(tag); value.textContent = text; value.className = className; return value; }
const status: Record<string, string> = { idle: '대기 중', closed: '쉬는 중', running: '작업 중', initializing: '준비 중', error: '확인 필요', queued: '대기 중', sending: '전송 중', completed: '완료', failed: '실패', canceled: '취소됨', uncertain: '결과 확인 필요' };
const messageOf = (error: unknown) => error instanceof AgentError ? error.message : '요청을 처리하지 못했습니다. 상태를 확인한 뒤 다시 시도해 주세요.';

export async function startAgents(core: WorknaruCore) {
  let selected: Agent | null = null;
  let settings: AgentSettings = { sendMode: 'queue', revision: 0 };
  let history: AgentHistory | null = null;
  let preview: ArchivePreview | null = null;
  let busy = false, sending = false, stopped = false, permissionSignature = '';
  let archiving = false;
  let readFailure = false;
  const drafts = new Map<string, string>();
  let listSignature = '', historySignature = '', queueSignature = '';
  let settingsRevision = 0;
  let creationId = crypto.randomUUID();
  let pendingSend: { id: string; agent: string; text: string } | null = null;
  const notice = (text: string) => { el('agent-notice').textContent = text; };
  const report = (error: unknown) => notice(messageOf(error));
  const composer = el<HTMLTextAreaElement>('message');
  const selectAgent = (agent: Agent) => {
    if (selected && selected.id !== agent.id) drafts.set(selected.id, composer.value);
    if (selected?.id !== agent.id) composer.value = drafts.get(agent.id) ?? '';
    selected = agent; history = null; historySignature = ''; permissionSignature = ''; queueSignature = ''; location.hash = agent.id;
  };
  const applySettings = (value: AgentSettings) => { settings = value; el('current-send-mode').textContent = `전송 방식: ${value.sendMode === 'queue' ? '대기열' : '추가 지시'} · 전송 설정에서 변경`; };

  function showHistory(page: AgentHistory, older = false) {
    if (!history || !history.entries.length || page.epoch !== history.epoch
      || (!older && page.entries[0] && page.entries[0].seq > history.entries.at(-1)!.seq + 1)) history = page;
    else {
      const entries = new Map(history.entries.map(e => [e.seq, e]));
      for (const e of page.entries) entries.set(e.seq, e);
      history = { ...page, cursor: older ? page.cursor : history.cursor, entries: [...entries.values()].sort((a, b) => a.seq - b.seq) };
    }
    const box = el('history'); const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    const signature = JSON.stringify(history); if (historySignature === signature) return; historySignature = signature;
    const previousHeight = box.scrollHeight; const previousScroll = box.scrollTop;
    box.replaceChildren();
    for (const entry of conversationMessages(history.entries).filter(e => e.text)) {
      const user = entry.type === 'user_message';
      const article = node('article', '', `message ${user ? 'user-message' : 'agent-message'}`);
      article.append(node('strong', user ? '나' : entry.type === 'assistant_message' ? 'Agent' : '작업 기록'), node('div', entry.text));
      box.append(article);
    }
    if (!box.childElementCount) box.append(node('p', selected?.archivedAt ? '보관된 Agent입니다. 대화 기록이 없습니다.' : '첫 메시지를 보내 작업을 시작하세요.', 'empty'));
    el<HTMLButtonElement>('older-history').hidden = !history.cursor;
    if (older) box.scrollTop = previousScroll + box.scrollHeight - previousHeight;
    else if (bottom) box.scrollTop = box.scrollHeight;
  }

  function showPermissions(agent: Agent) {
    const signature = JSON.stringify([agent.id, agent.archivedAt, agent.permissions]);
    if (signature === permissionSignature) return;
    permissionSignature = signature; const box = el('permissions'); box.replaceChildren();
    if (agent.archivedAt) return;
    for (const permission of agent.permissions) {
      const form = node('form', '', 'permission'); form.append(node('h3', permission.title || '응답이 필요합니다'), node('p', permission.description));
      const questions = Array.isArray(permission.input.questions) ? permission.input.questions as Record<string, unknown>[] : [];
      const answers = new Map<string, HTMLInputElement>();
      if (!questions.length && Object.keys(permission.input).length) form.append(node('pre', JSON.stringify(permission.input, null, 2)));
      for (const [i, question] of questions.entries()) {
        const label = node('label', String(question.question ?? question.header ?? '답변'));
        const field = node('input'); field.required = true;
        field.id = `question-${permission.id}-${i}`; label.htmlFor = field.id;
        if (Array.isArray(question.options)) {
          const list = node('datalist'); list.id = `${field.id}-options`; field.setAttribute('list', list.id);
          for (const option of question.options as Record<string, unknown>[]) { const item = node('option'); item.value = String(option.label); list.append(item); }
          form.append(list, node('small', question.multiSelect ? '여러 답은 쉼표로 구분하거나 직접 입력하세요.' : '추천 답변을 선택하거나 직접 입력하세요.'));
        }
        form.append(label, field); answers.set(String(question.header ?? ''), field);
      }
      const actions = permission.actions.length ? permission.actions : [{ id: '', label: '거부', behavior: 'deny' as const }, { id: '', label: questions.length ? '답변 전송' : '이번 요청 승인', behavior: 'allow' as const }];
      const buttons = node('div', '', 'dialog-actions'); const error = node('p', '', 'error'); error.setAttribute('role', 'alert');
      for (const action of actions) {
        const button = node('button', action.label, action.behavior === 'deny' ? 'secondary' : ''); button.type = 'button';
        button.onclick = async () => {
          if (action.behavior === 'allow' && !form.reportValidity()) return;
          for (const b of buttons.querySelectorAll('button')) b.disabled = true;
          try {
            await core.agents.permission({ agent: agent.id, id: permission.id, behavior: action.behavior,
              ...(action.id ? { actionId: action.id } : {}), ...(questions.length && action.behavior === 'allow' ? { answers: { answers: Object.fromEntries([...answers].map(([header, input]) => [header, input.value])) } } : {}) });
            notice('응답을 전달했습니다.'); permissionSignature = ''; await refresh();
          } catch (e) { error.textContent = messageOf(e); }
          finally { for (const b of buttons.querySelectorAll('button')) b.disabled = false; }
        };
        buttons.append(button);
      }
      form.onsubmit = event => event.preventDefault(); form.append(error, buttons); box.append(form);
    }
  }

  async function refresh() {
    if (busy || stopped || document.hidden) return;
    busy = true;
    try {
      const [agents, currentSettings] = await Promise.all([core.agents.list({ archived: el<HTMLInputElement>('show-archived').checked }), core.agents.settings({})]);
      applySettings(currentSettings);
      const list = el('agent-list');
      if (!selected && location.hash) { const saved = agents.find(a => a.id === location.hash.slice(1)); if (saved) selectAgent(saved); }
      const signature = JSON.stringify([agents, selected?.id]);
      if (signature !== listSignature) { listSignature = signature; list.replaceChildren();
      for (const agent of agents) {
        const button = node('button', '', 'agent-row'); button.type = 'button'; button.setAttribute('aria-pressed', String(agent.id === selected?.id));
        button.append(node('strong', agent.name), node('small', `${agent.archivedAt ? '보관됨' : agent.permissions.length ? '응답 필요' : status[agent.status] ?? agent.status} · ${agent.id.slice(0, 8)}`));
        button.onclick = () => { if (sending) return; selectAgent(agent); void refresh(); }; list.append(button);
      }
      if (!agents.length) list.append(node('p', '아직 Agent가 없습니다.', 'empty'));
      }
      if (selected) {
        const id = selected.id;
        const [agent, page, queue] = await Promise.all([core.agents.show({ agent: id }), core.agents.history({ agent: id }), core.agents.requests({ agent: id })]);
        if (selected.id !== id) return;
        selected = agent; el('agent-name').textContent = agent.name;
        if (!sending && pendingSend?.agent === id && queue.requests.some(r => r.id === pendingSend?.id && ['failed', 'canceled'].includes(r.state))) pendingSend = null;
        el('agent-detail').textContent = `${agent.archivedAt ? '보관됨' : agent.permissions.length ? '응답 필요' : status[agent.status] ?? agent.status} · ${agent.model ?? 'Codex'}\n${agent.cwd}`;
        el<HTMLButtonElement>('archive-agent').disabled = !!agent.archivedAt || sending;
        composer.disabled = !!agent.archivedAt || archiving; el<HTMLButtonElement>('send-message').disabled = !!agent.archivedAt || sending || archiving;
        showHistory(page); showPermissions(agent);
        const pending = queue.requests.filter(r => ['queued', 'sending', 'running', 'failed', 'uncertain'].includes(r.state));
        el('queue-summary').textContent = `대기 메시지 ${pending.filter(r => r.state === 'queued').length}개${queue.paused ? ' · 자동 실행 멈춤' : ''}`;
        const signature = JSON.stringify([id, agent.archivedAt, queue]);
        if (signature !== queueSignature) { queueSignature = signature;
        el('queue-list').replaceChildren();
        for (const request of pending) {
          const row = node('div', '', 'queue-row'); row.append(node('p', `${status[request.state]} · ${request.text}${request.error ? `\n${request.error}` : ''}`));
          if (request.state === 'queued' && !agent.archivedAt) {
            const cancel = node('button', '취소', 'secondary'); cancel.type = 'button'; cancel.onclick = async () => { cancel.disabled = true; try { await core.agents.cancel({ agent: id, id: request.id }); await refresh(); } catch (e) { report(e); cancel.disabled = false; } }; row.append(cancel);
          }
          if (request.state === 'uncertain' && !agent.archivedAt) {
            const discard = node('button', '기록 확인 후 실행 포기', 'secondary'); discard.type = 'button';
            discard.onclick = async () => { if (!window.confirm('대화와 작업 파일을 확인하셨나요? 이 요청을 취소 처리합니다. 재전송하거나 완료로 간주하지 않습니다.')) return; discard.disabled = true; try { await core.agents.discard({ agent: id, id: request.id }); notice('요청을 취소 처리했습니다. 남은 대기열을 재개할 수 있습니다.'); await refresh(); } catch (e) { report(e); discard.disabled = false; } }; row.append(discard);
          }
          el('queue-list').append(row);
        }
        el<HTMLButtonElement>('resume-queue').hidden = !queue.paused || !!agent.archivedAt;
        }
      }
      if (readFailure) { notice('연결이 복구됐습니다.'); readFailure = false; }
    } catch (e) { readFailure = true; report(e); }
    finally { busy = false; }
  }
  el<HTMLInputElement>('show-archived').onchange = () => void refresh();
  el('resume-queue').onclick = async () => { if (selected) try { await core.agents.resume({ agent: selected.id }); notice('남은 대기열을 재개했습니다.'); await refresh(); } catch (e) { report(e); } };
  el<HTMLButtonElement>('older-history').onclick = async () => { if (!selected || !history?.cursor) return; const id = selected.id; try { const page = await core.agents.history({ agent: id, cursor: history.cursor }); if (selected.id === id) showHistory(page, true); } catch (e) { report(e); } };
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-close]')) button.onclick = () => el<HTMLDialogElement>(button.dataset.close!).close();

  el('new-agent').onclick = async () => {
    if (sending) { notice('전송 결과를 확인한 뒤 새 Agent를 만들어 주세요.'); return; }
    creationId = crypto.randomUUID(); el('create-error').textContent = ''; el<HTMLButtonElement>('create-submit').disabled = true;
    el<HTMLDialogElement>('create-dialog').showModal();
    try {
      const options = await core.agents.options({}); el<HTMLInputElement>('create-cwd').value = options.defaultCwd;
      const models = el<HTMLSelectElement>('create-model'); models.replaceChildren();
      for (const model of options.models) { const option = node('option', model.name); option.value = model.id; option.selected = model.default; models.append(option); }
      if (!options.available) throw new AgentError('provider_unavailable', 'Codex 모델을 불러올 수 없습니다. 이 컴퓨터의 Codex 로그인 상태를 확인해 주세요.');
      el<HTMLButtonElement>('create-submit').disabled = false;
    } catch (e) { el('create-error').textContent = messageOf(e); }
  };
  let directoryTimer: ReturnType<typeof setTimeout>;
  el<HTMLInputElement>('create-cwd').oninput = () => {
    clearTimeout(directoryTimer); directoryTimer = setTimeout(async () => {
      const query = el<HTMLInputElement>('create-cwd').value; if (!query.trim()) return;
      try { const result = await core.agents.directories({ query }); if (el<HTMLInputElement>('create-cwd').value !== query) return;
        el('directory-suggestions').replaceChildren(...result.paths.map(path => { const option = node('option'); option.value = path; return option; }));
      } catch { /* A fully typed path remains usable when suggestions are unavailable. */ }
    }, 350);
  };
  el<HTMLFormElement>('create-form').onsubmit = async event => {
    event.preventDefault(); const button = el<HTMLButtonElement>('create-submit'); if (button.disabled) return; button.disabled = true;
    try {
      const agent = await core.agents.create({ id: creationId, name: el<HTMLInputElement>('create-name').value, cwd: el<HTMLInputElement>('create-cwd').value, model: el<HTMLSelectElement>('create-model').value });
      selectAgent(agent); el<HTMLInputElement>('show-archived').checked = false; el<HTMLDialogElement>('create-dialog').close(); notice('Agent를 만들었습니다. 첫 메시지를 보내세요.'); await refresh(); composer.focus();
    } catch (e) { el('create-error').textContent = messageOf(e); }
    finally { button.disabled = false; }
  };
  el<HTMLFormElement>('send-form').onsubmit = async event => {
    event.preventDefault(); if (!selected || selected.archivedAt || sending || archiving || !composer.value.trim()) return;
    const text = composer.value; const id = selected.id;
    if (!pendingSend || pendingSend.agent !== id || pendingSend.text !== text) pendingSend = { id: crypto.randomUUID(), agent: id, text };
    sending = true; el<HTMLButtonElement>('send-message').disabled = true;
    try {
      const request = await core.agents.send(pendingSend);
      if (request.state === 'uncertain') notice(request.error ?? '전송 결과를 확인해 주세요.');
      else if (request.state === 'failed' || request.state === 'canceled') {
        pendingSend = null;
        notice(`${request.error ?? (request.state === 'canceled' ? '이전 요청이 취소됐습니다.' : '전송에 실패했습니다.')} 다시 전송하면 새 요청으로 접수합니다.`);
      } else { if (composer.value === text && selected?.id === id) composer.value = ''; pendingSend = null; notice(request.state === 'completed' ? '이미 완료된 요청입니다. 대화 기록을 확인해 주세요.' : request.mode === 'steer' ? '메시지를 전달했습니다.' : '대기열에 추가했습니다. 이 화면을 닫아도 실행됩니다.'); }
    } catch (e) { report(e); }
    finally { sending = false; el<HTMLButtonElement>('send-message').disabled = !!selected?.archivedAt; await refresh(); composer.focus(); }
  };
  composer.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); el<HTMLFormElement>('send-form').requestSubmit(); } };
  el('open-settings').onclick = async () => { try { applySettings(await core.agents.settings({})); settingsRevision = settings.revision; el<HTMLSelectElement>('default-mode').value = settings.sendMode; el('settings-error').textContent = ''; el<HTMLDialogElement>('settings-dialog').showModal(); } catch (e) { report(e); } };
  el<HTMLFormElement>('settings-form').onsubmit = async event => {
    event.preventDefault(); try { applySettings(await core.agents.saveSettings({ sendMode: el<HTMLSelectElement>('default-mode').value as SendMode, revision: settingsRevision })); el<HTMLDialogElement>('settings-dialog').close(); notice('기본 전송 방식을 저장했습니다.'); } catch (e) { el('settings-error').textContent = messageOf(e); }
  };
  el('archive-agent').onclick = async () => {
    if (!selected) return;
    try {
      preview = await core.agents.archivePreview({ agent: selected.id }); el('archive-impact').replaceChildren(...preview.agents.map(a => node('p', `${a.name} (${a.id.slice(0, 8)}) · ${a.turnId ? '진행 중인 작업 중단' : a.archivedAt ? '이미 보관됨' : '보관 예정'}`)), node('p', `취소할 대기 메시지: ${preview.queued.length}개`));
      el('archive-error').textContent = ''; el<HTMLDialogElement>('archive-dialog').showModal();
    } catch (e) { report(e); }
  };
  el<HTMLButtonElement>('confirm-archive').onclick = async () => {
    if (!preview) return; const button = el<HTMLButtonElement>('confirm-archive'); button.disabled = true; archiving = true; composer.disabled = true; el<HTMLButtonElement>('send-message').disabled = true;
    try { const result = await core.agents.archive({ token: preview.token }); if (result.failed.length) throw new AgentError('archive_partial', `일부 Agent의 보관을 확인하지 못했습니다: ${result.failed.join(', ')}. 창을 닫고 보관 대상을 다시 확인해 주세요.`);
      el<HTMLDialogElement>('archive-dialog').close(); notice('보관했습니다. 보관함에서 대화 기록을 다시 볼 수 있습니다.'); await refresh();
    } catch (e) { el('archive-error').textContent = messageOf(e); }
    finally { button.disabled = false; archiving = false; await refresh(); }
  };
  await refresh();
  const timer = setInterval(() => void refresh(), 1500);
  window.addEventListener('pagehide', () => { stopped = true; clearInterval(timer); clearTimeout(directoryTimer); }, { once: true });
}
