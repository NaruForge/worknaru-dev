import type { PluginServerContext } from '@getpaseo/plugin/server';
import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
import { AgentError } from '@worknaru/runtime';
import { initialize } from './server/entry.mjs';

const contract = defineRpc({ name: 'agents.execute',
  input: z.object({ operation: z.string(), input: z.record(z.string(), z.unknown()) }).strict(),
  output: z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data: z.unknown() }),
    z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) })]) });

export default function contribute(server: PluginServerContext) {
  const service = initialize();
  // Initialization errors are surfaced through health without exposing raw local errors.
  service.catch(() => console.error('Agent service initialization failed. Inspect configuration and data storage.'));
  server.handle(contract, async ({ operation, input }) => {
    try { return { ok: true as const, data: await (await service).execute(operation, input) }; }
    catch (error) {
      return { ok: false as const, error: error instanceof AgentError
        ? { code: error.code, message: error.message }
        : { code: 'service_error', message: 'Agent 작업을 완료하지 못했습니다. doctor와 실행부 로그를 확인해 주세요.' } };
    }
  });
  return async () => { try { await (await service).close(); } catch { /* initialization already reported */ } };
}
