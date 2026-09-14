import type { PluginServerContext } from '@getpaseo/plugin/server';
import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
import { AgentError } from '@worknaru/runtime';
import { initialize } from './server/entry.mjs';
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

export default function contribute(server: PluginServerContext) {
  server.handle(management, async ({ operation, input }) => {
    try {
      const result = await manageData(operation, input);
      return result.ok ? { ok: true, data: result.value } : { ok: false, error: result.error };
    }
    catch { return { ok: false, error: { code: 'management_unavailable', message: '데이터 관리 실행기에 연결하지 못했습니다. 관리형 dev start 환경인지 확인하고 doctor로 진단해 주세요.' } }; }
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
  return async () => { try { await (await service).close(); } catch { /* initialization already reported */ } };
}
