import type { WorknaruCore, Agent, AgentRequest } from '../src/index.js';

declare const core: WorknaruCore;
const created: Promise<Agent> = core.agents.create({ id: 'create-1', name: 'Test', cwd: '/project', model: 'codex' });
const sent: Promise<AgentRequest> = core.agents.send({ agent: 'agent-1', id: 'send-1', text: 'Hello' });
void [created, sent];
core.agents.send({ agent: 'agent-1', id: 'send-project', text: 'Hello', target: { type: 'project', projectId: 'project-id' } });
// @ts-expect-error Project requests cannot override the server-derived Workspace.
core.agents.send({ agent: 'agent-1', id: 'bad', text: 'Hello', target: { type: 'project', projectId: 'p', workspaceId: 'w' } });
// @ts-expect-error Every returned request carries a resolved snapshot.
const missingContext: AgentRequest = { id: 'x', agentId: 'a', text: 'Hello', mode: 'queue', state: 'queued', turnId: null, createdAt: '', error: null };
void missingContext;
// @ts-expect-error Agent capabilities are not an arbitrary operation dispatcher.
core.agents('create', {});
// @ts-expect-error Other domains cannot route their operations through Agent capabilities.
core.agents.execute('workspace.run', {});
// @ts-expect-error Agent creation requires its own complete input.
core.agents.create({ text: 'Hello' });
// @ts-expect-error Message-level mode overrides are not part of the Agent API.
core.agents.send({ agent: 'agent-1', id: 'send-1', text: 'Hello', mode: 'steer' });

// @ts-expect-error Model discovery always requires an explicit working directory.
core.agents.options();
// @ts-expect-error There is no implicit default working folder in discovery results.
core.agents.options({ cwd: '/project' }).then(result => result.defaultCwd);
