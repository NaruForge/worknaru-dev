import type { PluginServerContext } from '@getpaseo/plugin/server';
import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
import { AgentError } from '@worknaru/runtime';
import { ModuleError } from '@worknaru/runtime';
import { initializeModules } from './server/module-service.mjs';
import { WorkspaceDomainError } from '@worknaru/core';
import { initialize } from './server/entry.mjs';
import { initializeWorkspaceDomain } from './server/workspace-domain.mjs';
import { manageData } from './server/data-management.mjs';

const management = defineRpc({ name: 'development.data',
  input: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('snapshot'), input: z.object({}).strict() }).strict(),
    z.object({ operation: z.literal('preview'), input: z.object({}).strict() }).strict(),
    z.object({ operation: z.literal('open'), input: z.object({ id: z.string().min(1).max(120) }).strict() }).strict(),
    z.object({ operation: z.literal('reset'), input: z.object({ token: z.uuid(), id: z.uuid() }).strict() }).strict(),
  ]),
  output: z.object({ ok: z.boolean(), data: z.unknown().optional(), error: z.object({ code: z.string(), message: z.string() }).optional() }),
});

const contract = defineRpc({ name: 'agents.execute',
  input: z.object({ operation: z.enum(['health', 'options', 'directories', 'create', 'list', 'show', 'history', 'send', 'requests', 'cancel', 'discard', 'resume', 'permission', 'archivePreview', 'archive', 'settings', 'saveSettings']), input: z.record(z.string(), z.unknown()) }).strict(),
  output: z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data: z.unknown() }),
    z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]) });

const workspaceContract = defineRpc({ name: 'workspace.execute',
  input: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('createWorkspace'), input: z.object({ name: z.string() }).strict() }).strict(),
    z.object({ operation: z.literal('listWorkspaces'), input: z.object({}).strict() }).strict(),
    z.object({ operation: z.literal('getWorkspace'), input: z.object({ id: z.string() }).strict() }).strict(),
    z.object({ operation: z.literal('createProject'), input: z.object({ workspaceId: z.string(), name: z.string() }).strict() }).strict(),
    z.object({ operation: z.literal('listProjects'), input: z.object({ workspaceId: z.string() }).strict() }).strict(),
    z.object({ operation: z.literal('getProject'), input: z.object({ id: z.string() }).strict() }).strict(),
  ]),
  output: z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data: z.unknown() }),
    z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]),
});

export default function contribute(server: PluginServerContext) {
  server.handle(management, async ({ operation, input }) => {
    try {
      const result = await manageData(operation, input);
      return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
    }
    catch { return { ok: false, error: { code: 'management_unavailable', message: '데이터 관리 실행기에 연결하지 못했습니다. 관리형 dev start 환경인지 확인하고 doctor로 진단해 주세요.' } }; }
  });
  // Product metadata does not wait for a Paseo Agent driver or Provider connection.
  const workspaceDomain = initializeWorkspaceDomain();
  const modules = workspaceDomain.then(({ api }) => initializeModules(api));
  modules.catch(() => console.error('Module initialization failed. Inspect owned data storage.'));
  server.handle(defineRpc({ name: 'modules.execute',
    input: z.object({ operation: z.enum(['list', 'execute', 'getRun', 'listRuns']), input: z.unknown() }).strict(),
    output: z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data: z.unknown() }),
      z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]),
  }), async ({ operation, input }) => {
    try {
      const { api } = await modules;
      if (operation === 'list') {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new ModuleError('invalid_input', '목록에는 입력 필드를 지정하지 않습니다.');
        return { ok: true as const, data: await api.list() };
      }
      // Core validates untrusted RPC values before any storage or execution.
      return { ok: true as const, data: await api[operation](input as never) };
    } catch (error) {
      return { ok: false as const, error: error instanceof ModuleError
        ? { code: error.code, message: error.message }
        : { code: 'service_error', message: 'Module 서비스를 준비하거나 요청을 처리하지 못했습니다.' } };
    }
  });
  workspaceDomain.catch(() => console.error('Workspace domain initialization failed. Inspect owned data storage.'));
  server.handle(workspaceContract, async request => {
    try {
      const { api } = await workspaceDomain;
      switch (request.operation) {
        case 'createWorkspace': return { ok: true as const, data: await api.createWorkspace(request.input) };
        case 'listWorkspaces': return { ok: true as const, data: await api.listWorkspaces() };
        case 'getWorkspace': return { ok: true as const, data: await api.getWorkspace(request.input) };
        case 'createProject': return { ok: true as const, data: await api.createProject(request.input) };
        case 'listProjects': return { ok: true as const, data: await api.listProjects(request.input) };
        case 'getProject': return { ok: true as const, data: await api.getProject(request.input) };
      }
    } catch (error) {
      return { ok: false as const, error: error instanceof WorkspaceDomainError
        ? { code: error.code, message: error.message }
        : { code: 'service_error', message: '업무 저장소를 준비하지 못했습니다. doctor와 전용 데이터 설정을 확인해 주세요.' } };
    }
  });
  const service = initialize();
  // Initialization errors are surfaced through health without exposing raw local errors.
  service.catch(() => console.error('Agent service initialization failed. Inspect configuration and data storage.'));
  server.handle(contract, async ({ operation, input }) => {
    try { return { ok: true as const, data: await (await service)[operation](input) }; }
    catch (error) {
      return { ok: false as const, error: error instanceof AgentError
        ? { code: error.code, message: error.message }
        : { code: 'service_error', message: 'Agent 작업을 완료하지 못했습니다. doctor와 실행부 로그를 확인해 주세요.' } };
    }
  });
  return async () => {
    await modules.then(value => value.close()).catch(() => {});
    await Promise.allSettled([service.then(value => value.close()), workspaceDomain.then(value => value.close())]);
  };
}
