import { ModuleError, type ModuleAPI, type ModuleRun, type WorknaruCore } from '@worknaru/core';
import { sameTarget } from '../features/modules/useModuleSession.js';

export const sampleRun: ModuleRun = {
  id: '33333333-3333-4333-8333-333333333333',
  requestId: '44444444-4444-4444-8444-444444444444',
  moduleId: 'text-stats',
  moduleVersion: '1.0.0',
  context: { type: 'standalone', workspaceId: null, projectId: null },
  input: { text: '안녕\n세상' },
  result: { characters: 5, lines: 2 },
  status: 'succeeded',
  error: null,
  createdAt: '2026-09-16T01:00:00.000Z',
  startedAt: '2026-09-16T01:00:00.000Z',
  finishedAt: '2026-09-16T01:00:00.000Z',
};
export function moduleFixture(
  workspace: WorknaruCore['workspace'],
  initial: ModuleRun[] = [sampleRun],
): ModuleAPI {
  const runs = structuredClone(initial);
  return {
    list: async () => [
      {
        id: 'text-stats',
        version: '1.0.0',
        name: '텍스트 통계',
        contexts: ['standalone', 'workspace', 'project'],
      },
    ],
    listRuns: async ({ target }) => structuredClone(runs.filter((run) => sameTarget(run, target))),
    getRun: async ({ id }) => {
      const run = runs.find((run) => run.id === id);
      if (!run) throw new ModuleError('run_not_found', '실행 기록을 찾을 수 없습니다.');
      return structuredClone(run);
    },
    execute: async (request) => {
      const existing = runs.find((run) => run.requestId === request.requestId);
      if (existing) return structuredClone(existing);
      const target = request.target;
      const context: ModuleRun['context'] =
        target.type === 'standalone'
          ? { ...target, workspaceId: null, projectId: null }
          : target.type === 'workspace'
            ? { ...target, projectId: null }
            : {
                ...target,
                workspaceId: (await workspace.getProject({ id: target.projectId })).workspaceId,
              };
      const text = String(request.input.text);
      const run: ModuleRun = {
        ...sampleRun,
        id: crypto.randomUUID(),
        requestId: request.requestId,
        context,
        input: request.input,
        result: {
          characters: Array.from(text).length,
          lines: text.length ? text.split(/\r\n|\r|\n/).length : 0,
        },
      };
      runs.push(run);
      return structuredClone(run);
    },
  };
}
