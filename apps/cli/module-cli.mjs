import { ModuleError } from '@worknaru/core';
import { DataError } from '../../packages/dev-environment/paths.mjs';
import { CliError } from './dist/arguments.js';
import { createCore } from './dist/bootstrap.js';
import { productConfiguration } from './product-connection.mjs';

export async function runModules({ operation, input, options }, env, output, coreFactory = createCore) {
  const json = !!options['--json'];
  try {
    const core = coreFactory(await productConfiguration(options, env));
    const result = operation === 'list' ? await core.modules.list() : await core.modules[operation](input);
    if (json) output.stdout(JSON.stringify(result) + '\n');
    else {
      const items = Array.isArray(result) ? result : [result];
      output.stdout(items.length ? items.map(item => item.status
        ? `${item.id}  ${item.moduleId}@${item.moduleVersion}  ${item.status}\n요청: ${item.requestId}\n대상: ${JSON.stringify(item.context)}\n${JSON.stringify(item.result ?? item.error)}\n`
        : `${item.id}@${item.version}  ${item.name}\n`).join('\n') : '아직 항목이 없습니다.\n');
    }
    return operation === 'execute' && ['failed', 'uncertain'].includes(result.status) ? 1 : 0;
  } catch (error) {
    const known = error instanceof ModuleError || error instanceof CliError || error instanceof DataError;
    const detail = { code: known ? error.code : 'internal_error', message: known ? error.message : 'Module 명령을 완료하지 못했습니다.' };
    if (json) output.stdout(JSON.stringify({ error: detail }) + '\n');
    else output.stderr(`${detail.code}: ${detail.message}\n`);
    if (!known) return 3;
    if (error instanceof CliError || ['invalid_input', 'request_conflict'].includes(detail.code)) return 2;
    return error instanceof DataError ? error.exitCode : 1;
  }
}
