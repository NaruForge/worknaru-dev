import { WorkspaceDomainError } from '@worknaru/core';
import { DataError } from '../../packages/dev-environment/paths.mjs';
import { CliError } from './dist/arguments.js';
import { createCore } from './dist/bootstrap.js';
import { productConfiguration } from './product-connection.mjs';

export async function runWorkspace({ operation, input, options }, env, output, coreFactory = createCore) {
  const json = !!options['--json'];
  try {
    const core = coreFactory(await productConfiguration(options, env));
    const result = operation === 'listWorkspaces' ? await core.workspace.listWorkspaces() : await core.workspace[operation](input);
    if (json) output.stdout(`${JSON.stringify(result)}\n`);
    else {
      const items = Array.isArray(result) ? result : [result];
      output.stdout(items.length ? items.map(item => `${item.name}\n  ID: ${item.id}${item.workspaceId ? `\n  Workspace: ${item.workspaceId}` : ''}\n  생성: ${item.createdAt}\n`).join('\n') : '아직 항목이 없습니다.\n');
    }
    return 0;
  } catch (error) {
    const known = error instanceof WorkspaceDomainError || error instanceof CliError || error instanceof DataError;
    const detail = { code: known ? error.code : 'internal_error', message: known ? error.message : '명령을 완료하지 못했습니다. 실행 환경의 준비 상태를 확인해 주세요.' };
    if (json) output.stdout(`${JSON.stringify({ error: detail })}\n`);
    else output.stderr(`${detail.code}: ${detail.message}\n`);
    if (!known) return 3;
    if (error instanceof CliError || detail.code === 'invalid_input') return 2;
    return error instanceof DataError ? error.exitCode : 1;
  }
}
