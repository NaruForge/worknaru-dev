import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { inspect, localPaths } from './local.mjs';
import { endpoint } from '../../packages/dev-environment/config.mjs';
import { conversationMessages } from '@worknaru/core';

import { agentHelp, parseAgentArgs } from './agent-arguments.mjs';
export { agentHelp, parseAgentArgs } from './agent-arguments.mjs';

export async function runAgents(args, env, output) {
  if (args.includes('--help') || args.includes('-h') || args.length < 2) { output.stdout(agentHelp); return 0; }
  const json = args.includes('--json'); const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !json;
  let rl;
  const ask = async prompt => { rl ??= createInterface({ input: process.stdin, output: process.stderr }); return rl.question(prompt); };
  const emit = data => output.stdout(json ? `${JSON.stringify(data)}\n` : format(data));
  const emitError = error => json ? emit({ error }) : output.stderr(`${error.message}\n`);
  try {
    let parsed;
    try { parsed = parseAgentArgs(args); } catch (e) { emitError({ code: 'invalid_arguments', message: e.message }); return 2; }
    const { positional: p, options: o } = parsed;
    const [{ createCore }, { parseCommand }] = await Promise.all([import('./dist/bootstrap.js'), import('./dist/arguments.js')]);
    const connectionArgs = ['--endpoint', '--server-id', '--target', '--timeout-ms'].flatMap(flag => o[flag] ? [flag, o[flag]] : []);
    let configuration;
    if (connectionArgs.length || ['ENDPOINT', 'SERVER_ID', 'TARGET_ID', 'TIMEOUT_MS', 'PASSWORD'].some(key => env[`WORKNARU_${key}`] !== undefined)) {
      configuration = parseCommand(['status', ...connectionArgs], env).configuration;
    } else {
      const current = await inspect(localPaths(env));
      if (current.state !== 'running') throw Object.assign(Error('먼저 pnpm exec worknaru dev start를 실행해 주세요.'), { code: 'not_running' });
      configuration = { targetId: 'worknaru-dev', endpoint, expectedServerId: current.serverId, timeoutMs: 5000 };
    }
    const core = createCore(configuration); const call = (operation, input = {}) => core.agents(operation, input);
    const expect = count => { if (p.length !== count) throw Object.assign(Error('명령 인자를 확인해 주세요. agent --help'), { code: 'invalid_arguments' }); };
    const select = async selector => {
      if (selector) return selector;
      if (!interactive) throw Object.assign(Error('Agent 이름 또는 ID가 필요합니다.'), { code: 'invalid_arguments' });
      const list = await call('list'); output.stderr(format(list));
      return ask('Agent 이름 또는 ID: ');
    };
    if (p[0] === 'settings') {
      if (p[1] === 'get' && p.length <= 3 && (!p[2] || p[2] === 'send-mode')) { emit(await call('settings')); return 0; }
      if (p[1] === 'set' && p[2] === 'send-mode') { expect(4); const current = await call('settings'); emit(await call('saveSettings', { sendMode: p[3], revision: current.revision })); return 0; }
      throw Object.assign(Error('settings get/set send-mode를 사용하세요.'), { code: 'invalid_arguments' });
    }
    const command = p[1]; let result;
    if (command === 'create') {
      expect(2);
      const cwd = path.resolve(o['--cwd'] ?? (interactive ? (await ask(`작업 폴더 [${process.cwd()}]: `) || process.cwd()) : process.cwd()));
      const options = await call('options', { cwd });
      let model = o['--model'] ?? options.models.find(m => m.default)?.id;
      if (interactive && !o['--model']) {
        output.stderr(options.models.map((m, i) => `${i + 1}. ${m.name}${m.id === model ? ' (기본)' : ''}`).join('\n') + '\n');
        const choice = await ask('모델 번호 또는 ID [기본값]: ');
        if (choice) model = options.models[Number(choice) - 1]?.id ?? choice;
      }
      if (!model) throw Object.assign(Error('사용 가능한 기본 모델이 없습니다. --model을 지정해 주세요.'), { code: 'invalid_model' });
      const name = (o['--name'] ?? (interactive ? await ask('Agent 이름 [새 Agent]: ') : '')) || '새 Agent';
      result = await call('create', { id: o['--id'] ?? crypto.randomUUID(), name, cwd, model });
    } else if (command === 'list') { expect(2); result = await call('list', { archived: !!o['--archived'] }); }
    else if (command === 'show' || command === 'permissions') {
      expect(3); result = await call('show', { agent: p[2] }); if (command === 'permissions') result = result.permissions;
    } else if (command === 'history') {
      expect(3); result = await call('history', { agent: p[2] });
      while (o['--all'] && result.cursor) { const earlier = await call('history', { agent: p[2], cursor: result.cursor }); result = earlier.epoch === result.epoch ? { ...earlier, entries: [...earlier.entries, ...result.entries] } : earlier; }
    } else if (command === 'queue') {
      if (p[2] === 'list') { expect(4); result = await call('requests', { agent: p[3] }); }
      else if (p[2] === 'cancel') { expect(5); result = await call('cancel', { agent: p[3], id: p[4] }); }
      else if (p[2] === 'resume') { expect(4); result = await call('resume', { agent: p[3] }); }
      else if (p[2] === 'discard') { expect(5); if (!o['--yes']) { emit({ confirmationRequired: true, message: '대화와 파일을 확인한 뒤 --yes를 붙이면 불명확한 요청을 취소 처리합니다. 완료로 간주하거나 재전송하지 않습니다.' }); return 1; } result = await call('discard', { agent: p[3], id: p[4] }); }
      else throw Object.assign(Error('queue list/cancel/resume을 사용하세요.'), { code: 'invalid_arguments' });
    } else if (command === 'permission' && p[2] === 'respond') {
      expect(5);
      if (!o['--allow'] && !o['--deny']) throw Object.assign(Error('--allow 또는 --deny를 지정해 주세요.'), { code: 'invalid_arguments' });
      result = await call('permission', { agent: p[3], id: p[4], behavior: o['--allow'] ? 'allow' : 'deny',
        ...(o['--action'] ? { actionId: o['--action'] } : {}), ...(o['--answers'] ? { answers: JSON.parse(o['--answers']) } : {}) });
    } else if (command === 'archive') {
      expect(3); const preview = await call('archivePreview', { agent: p[2] });
      if (!o['--yes']) {
        if (!interactive) { emit({ confirmationRequired: true, preview, next: `pnpm exec worknaru agent archive "${p[2]}" --yes` }); return 1; }
        output.stderr(`보관할 Agent:\n${format(preview.agents)}중단될 작업 ${preview.agents.filter(a => a.turnId || a.status === 'running').length}개, 취소할 대기 메시지 ${preview.queued.length}개\n`);
        if ((await ask('기록을 남기고 함께 보관할까요? [y/N]: ')).toLowerCase() !== 'y') { emit({ canceled: true }); return 0; }
      }
      result = await call('archive', { token: preview.token }); emit(result); return result.failed.length ? 1 : 0;
    } else if (command === 'send' || command === 'wait') {
      expect(command === 'send' ? 4 : 3); const selected = await select(p[2]);
      let request;
      if (command === 'send') request = await call('send', { agent: selected, id: o['--id'] ?? crypto.randomUUID(), text: p[3],
        ...(o['--queue'] ? { mode: 'queue' } : o['--steer'] ? { mode: 'steer' } : {}) });
      else { const list = await call('requests', { agent: selected }); request = o['--request'] ? list.requests.find(r => r.id === o['--request']) : list.requests.at(-1); }
      if (!request) throw Object.assign(Error('확인할 요청이 없습니다.'), { code: 'not_found' });
      if (o['--no-wait']) { emit(request); return ['failed', 'uncertain'].includes(request.state) ? 1 : 0; }
      const abort = new AbortController(); const interrupt = () => abort.abort(); process.once('SIGINT', interrupt);
      const deadline = Date.now() + Number(o['--wait-timeout'] ?? 600) * 1000; let last;
      try {
        while (Date.now() < deadline && !abort.signal.aborted) {
          const [list, current] = await Promise.all([call('requests', { agent: selected }), call('show', { agent: selected })]);
          request = list.requests.find(r => r.id === request.id) ?? request;
          if (!json && request.state !== last) { output.stderr(`요청 ${request.id}: ${request.state}\n`); last = request.state; }
          if (['completed', 'failed', 'canceled', 'uncertain'].includes(request.state)) {
            const history = await call('history', { agent: selected });
            const start = history.entries.findIndex(e => e.messageId === request.id && e.type === 'user_message');
            emit({ request, entries: start < 0 ? [] : history.entries.slice(start + 1).filter(e => e.turnId === request.turnId && e.type === 'assistant_message'), ...(start < 0 ? { note: '응답은 agent history에서 확인해 주세요.' } : {}) });
            return request.state === 'completed' ? 0 : 1;
          }
          if (current.permissions.length) {
            if (!interactive) { emit({ request, permissions: current.permissions, outcome: 'permission_pending' }); return 1; }
            const permission = current.permissions[0]; output.stderr(`${permission.title}\n${permission.description}\n${JSON.stringify(permission.input, null, 2)}\n`);
            const answer = await ask('이번 요청을 승인할까요? [y/N]: ');
            let answers;
            if (permission.kind === 'question' && answer.toLowerCase() === 'y') {
              const fields = {};
              for (const question of permission.input.questions ?? []) {
                output.stderr(`${question.question ?? question.header}\n`);
                const options = question.options ?? [];
                output.stderr(options.map((option, index) => `${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ''}`).join('\n') + '\n');
                const value = await ask(question.multiSelect ? '번호 또는 답변 (여러 답은 쉼표로 구분): ' : '번호 또는 답변: ');
                fields[question.header] = value.split(',').map(part => options[Number(part.trim()) - 1]?.label ?? part.trim()).join(', ');
              }
              answers = { answers: fields };
            }
            await call('permission', { agent: selected, id: permission.id, behavior: answer.toLowerCase() === 'y' ? 'allow' : 'deny', ...(answers ? { answers } : {}) });
          }
          try { await delay(1000, undefined, { signal: abort.signal }); } catch { break; }
        }
        emit({ request, outcome: abort.signal.aborted ? 'observation_stopped' : 'wait_timeout', next: `pnpm exec worknaru agent wait "${selected}" --request ${request.id}` });
        return abort.signal.aborted ? 130 : 1;
      } finally { process.removeListener('SIGINT', interrupt); }
    } else throw Object.assign(Error('알 수 없는 Agent 명령입니다. agent --help'), { code: 'invalid_arguments' });
    emit(result); return 0;
  } catch (error) {
    emitError({ code: error.code ?? 'invalid_arguments', message: error.code ? error.message : '입력값을 확인해 주세요. agent --help' });
    return ['invalid_arguments', 'invalid_input', 'invalid_configuration'].includes(error.code ?? 'invalid_arguments') ? 2 : 1;
  } finally { rl?.close(); }
}

export function format(value) {
  if (Array.isArray(value)) return value.length ? value.map(v => v.name ? `${v.name}  ${v.id}  ${v.archivedAt ? '보관됨' : v.status}\n  ${v.cwd}` : `${v.title ?? v.id ?? ''}\n${v.description ?? ''}`).join('\n') + '\n' : '항목이 없습니다.\n';
  if (value?.error) return `${value.error.message}\n`;
  if (value?.entries) return (value.request ? `요청: ${value.request.state}\n` : '') + conversationMessages(value.entries).map(e => `[${e.type === 'user_message' ? '사용자' : e.type === 'assistant_message' ? 'Agent' : e.type}] ${e.text}`).join('\n') + '\n';
  if (value?.name && value.id) return `${value.name} (${value.id})\n상태: ${value.archivedAt ? '보관됨' : value.status}\n폴더: ${value.cwd}\n모델: ${value.model}\n다음: pnpm exec worknaru agent send "${value.name}" "메시지"\n`;
  return `${JSON.stringify(value, null, 2)}\n`;
}
