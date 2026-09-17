import assert from 'node:assert/strict';
import { glob, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function agentRecord(dataHome, id) {
  const directory = path.join(dataHome, 'agents');
  const files = await readdir(directory, { recursive: true });
  const filename = files.find(file => path.basename(file) === `${id}.json`);
  assert.ok(filename, 'Paseo must persist the Agent registry');
  return JSON.parse(await readFile(path.join(directory, filename), 'utf8'));
}

// Inspect only this smoke's Provider session; never export global instructions or auth.
export async function systemAgentEvidence(dataHome, system, developer, question) {
  const record = await agentRecord(dataHome, system.id);
  const devRecord = await agentRecord(dataHome, developer.id);
  const sessionId = record.persistence?.sessionId;
  assert.ok(sessionId && devRecord.persistence?.sessionId);
  assert.notEqual(sessionId, devRecord.persistence.sessionId);
  assert.equal(record.cwd, path.join(dataHome, 'system-agent'));
  const providerHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const files = [];
  for await (const file of glob(`**/*${sessionId}.jsonl`, { cwd: path.join(providerHome, 'sessions') })) files.push(file);
  assert.equal(files.length, 1, 'The new Codex session must expose a single observable rollout');
  const records = (await readFile(path.join(providerHome, 'sessions', files[0]), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.find(value => value.type === 'session_meta')?.payload.id, sessionId);
  assert.equal(records.find(value => value.type === 'session_meta')?.payload.cwd, system.cwd);
  const template = (await readFile(path.join(system.cwd, 'AGENTS.md'), 'utf8')).trim();
  const inputs = records.filter(value => value.type === 'response_item' && ['user', 'developer', 'system'].includes(value.payload?.role));
  const inputText = inputs.map(value => (value.payload.content ?? []).map(part => part.text ?? '').join('\n')).join('\n');
  assert.ok(inputText.includes(template), 'Actual Provider input must contain the entire deployed product instructions');
  assert.ok(inputText.includes(system.cwd), 'Actual Provider input must identify the dedicated cwd');
  assert.ok(inputText.includes(question));
  assert.ok(!inputText.includes('# Worknaru 개발 Agent 지침'), 'Repository development instructions must not be supplied');
  assert.ok(!inputText.includes('Remember RIVER') && !inputText.includes('FOLLOWUP'), 'Developer conversation must not be supplied');
  const userMessages = inputs.filter(value => value.payload.role === 'user')
    .map(value => value.payload.content.map(part => part.text ?? '').join('\n'));
  assert.equal(userMessages.filter(text => text === question).length, 1);
  return { agentId: system.id, providerSessionId: sessionId, developerAgentId: developer.id,
    developerProviderSessionId: devRecord.persistence.sessionId, cwd: system.cwd, model: system.model,
    fullProductInstructionsObserved: true, instructionsSha256: createHash('sha256').update(template).digest('hex'),
    separateConversationObserved: true, providerGlobalIsolation: false };
}
