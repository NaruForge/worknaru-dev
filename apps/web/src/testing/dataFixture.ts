import type { DataClient, DataSnapshot } from '../shell/dataClient.js';

export function createDataFixture(
  mode: 'ready' | 'error' | 'blocked' | 'loading' = 'ready',
): DataClient {
  const root = 'C:\\WorknaruData\\Development';
  const snapshot: DataSnapshot = {
    serverId: 'fixture-server',
    host: 'DEVELOPMENT-PC',
    dataRoot: root,
    source: 'default',
    projectsError: null,
    items: [
      {
        id: 'root',
        label: '전용 데이터 루트',
        path: root,
        kind: 'directory',
        manager: 'Worknaru',
        description: '전용 실행 데이터 전체',
        reset: true,
        state: 'present',
        canOpen: true,
      },
      {
        id: 'db',
        label: '메시지·대기열 DB',
        path: root + '\\agent-state.sqlite',
        kind: 'file',
        manager: 'Worknaru',
        description: '전송 요청·결과·공유 설정. 전체 대화 기록 DB가 아닙니다.',
        reset: true,
        state: 'present',
        canOpen: true,
      },
      {
        id: 'tmp',
        label: '임시 파일',
        path: root + '\\tmp',
        kind: 'directory',
        manager: 'Worknaru',
        description: '실행별 임시 파일',
        reset: true,
        state: 'missing',
        canOpen: false,
      },
      {
        id: 'work',
        label: 'Agent 실제 작업 폴더',
        path: 'C:\\Projects\\customer-support\\regional-operations\\quarterly-customer-service-analysis',
        kind: 'directory',
        manager: '사용자 / Agent',
        description: '고객 지원 업무',
        reset: false,
        state: 'present',
        canOpen: true,
      },
    ],
  };
  return {
    async snapshot() {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'error') throw Error('저장 위치를 조회하지 못했습니다.');
      return snapshot;
    },
    async open() {},
    async preview() {
      return {
        dataRoot: root,
        items: snapshot.items.filter((item) => item.reset).map((item) => item.path),
        token: mode === 'blocked' ? null : 'fixture-preview',
        blockers:
          mode === 'blocked'
            ? [
                {
                  code: 'operation_busy',
                  message: '다른 작업이 진행 중입니다. 작업이 끝난 뒤 다시 확인해 주세요.',
                },
              ]
            : [],
      };
    },
    async reset() {},
    async restarted() {
      return false;
    },
    reload() {},
  };
}
