import type { WorknaruCore, Agent, AgentRequest } from '../src/index.js';

declare const core: WorknaruCore;
const created: Promise<Agent> = core.agents.create({ id: 'create-1', name: 'Test', cwd: '/project', model: 'codex' });
const sent: Promise<AgentRequest> = core.agents.send({ agent: 'agent-1', id: 'send-1', text: 'Hello', mode: 'queue' });
void [created, sent];
// @ts-expect-error Agent capabilities are not an arbitrary operation dispatcher.
core.agents('create', {});
// @ts-expect-error Other domains cannot route their operations through Agent capabilities.
core.agents.execute('workspace.run', {});
// @ts-expect-error Agent creation requires its own complete input.
core.agents.create({ text: 'Hello' });
// @ts-expect-error Transmission modes remain a closed domain type.
core.agents.send({ agent: 'agent-1', id: 'send-1', text: 'Hello', mode: 'interrupt' });
