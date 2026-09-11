import type { DaemonStatus } from '@worknaru/core';
import { loadCore } from './bootstrap.js';
import { startAgents } from './agents.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing page element: ${id}`);
  return found as T;
}

const button = element<HTMLButtonElement>('check-status');
const result = element('result');
const title = element('result-title');
const description = element('result-description');
const serverId = element('server-id');
const version = element('server-version');
const checkedAt = element('checked-at');

const failureMessages: Record<NonNullable<DaemonStatus['failure']>['code'], string> = {
  connection_failed: '연결할 수 없습니다. 전용 Daemon이 실행 중인지 확인해 주세요.',
  authentication_required: '이 Daemon은 인증이 필요합니다.',
  authentication_failed: 'Daemon 인증에 실패했습니다.',
  timeout: '응답을 기다리는 시간이 초과됐습니다. 다시 확인해 주세요.',
  target_mismatch: '응답한 서버가 설정된 전용 Daemon과 다릅니다.',
  unsupported_version: '현재 지원하는 Paseo 버전과 다릅니다.',
  invalid_response: 'Daemon의 응답을 확인할 수 없습니다.',
  request_failed: 'Daemon이 상태 조회 요청을 처리하지 못했습니다.',
  cleanup_failed: '조회 연결을 정리하지 못했습니다.',
  unknown: '상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',
};

function show(phase: string, heading: string, message: string) {
  result.dataset.phase = phase;
  title.textContent = heading;
  description.textContent = message;
}

async function start() {
  try {
    const { core, endpoint } = await loadCore();
    void startAgents(core);
    element('endpoint').textContent = endpoint;
    button.disabled = false;
    show('idle', '확인 대기', '버튼을 눌러 현재 연결 상태를 확인해 주세요.');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = '확인 중…';
      result.setAttribute('aria-busy', 'true');
      serverId.textContent = '—';
      version.textContent = '—';
      checkedAt.textContent = '—';
      show('loading', '조회 중', 'Daemon의 응답을 기다리고 있습니다.');
      try {
        const status = await core.getDaemonStatus();
        checkedAt.textContent = new Date(status.checkedAt).toLocaleTimeString('ko-KR');
        if (status.outcome === 'available') {
          serverId.textContent = status.server!.id;
          version.textContent = status.server!.version ?? '확인 불가';
          show('success', '연결 성공', '전용 Daemon이 정상적으로 응답했습니다.');
        } else {
          show('error', '연결 실패', failureMessages[status.failure.code]);
        }
      } catch {
        show('error', '조회 실패', '상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.');
      } finally {
        button.disabled = false;
        button.textContent = '상태 확인';
        result.setAttribute('aria-busy', 'false');
      }
    });
  } catch {
    show('error', '설정 확인 필요', '개발 환경의 접속 설정을 불러오지 못했습니다. 웹 개발 명령으로 실행해 주세요.');
  }
}

void start();
