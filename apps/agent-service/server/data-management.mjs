import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDataPaths, samePath } from '@worknaru/dev-environment/paths';
import { assertStorage, regularJson } from '@worknaru/dev-environment/storage';
import { request } from '@worknaru/dev-environment/control';

// App-level development management, outside the product Agent/Core contract.
export async function manageData(operation, input) {
  const dataRoot = process.env.WORKNARU_AGENT_DATA_ROOT;
  const repository = process.env.WORKNARU_REPOSITORY_ROOT;
  if (!dataRoot || !repository) throw Error('Missing owned environment');
  const paths = resolveDataPaths({ WORKNARU_DATA_DIR: dataRoot }, repository);
  await assertStorage(paths);
  const owner = await regularJson(path.join(dataRoot, 'dev-instance.json'));
  if (owner.schema !== 1 || !/^[a-f0-9-]{36}$/.test(owner.token)
    || !samePath(owner.repository, repository) || !samePath(owner.dataRoot, dataRoot)) throw Error('Unverified controller');
  const serverId = (await readFile(paths.serverId, 'utf8')).trim();
  const result = await request(owner, `data.${operation}`, 30000, { ...input, serverId });
  if (!result.data) throw Error('Missing management response');
  return result.data;
}
