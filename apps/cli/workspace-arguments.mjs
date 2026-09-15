export const workspaceHelp = `Workspace·Project 사용법 (pnpm exec worknaru ...)
  workspace create --name <이름>
  workspace list
  workspace show <전체 ID>
  project create --workspace <Workspace ID> --name <이름>
  project list --workspace <Workspace ID>
  project show <전체 ID>

--json: 질문 없이 JSON 한 문서. --help, -h: 도움말.
이름/ID 접두사 대신 생성된 전체 UUID를 사용합니다. 이름은 중복될 수 있습니다.
명시적 연결: --endpoint URL --server-id ID [--target ID] [--timeout-ms 밀리초]
기존 WORKNARU_* 연결 설정을 적용하며 생략 시 관리형 로컬 환경을 사용합니다.
--timeout-ms는 연결부터 RPC 완료까지의 총 제한 시간입니다 (기본 5000).
생성 응답이 불명확하면 목록을 확인하세요. 자동 재시도하지 않습니다.
종료 코드: 0 성공/도움말, 1 작업 실패, 2 입력/설정 오류, 3 내부 오류.
`;

export function parseWorkspaceArgs(args) {
  const positional = [];
  const options = {};
  const values = new Set(['--name', '--workspace', '--endpoint', '--server-id', '--target', '--timeout-ms']);
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('-')) { positional.push(token); continue; }
    if ((token !== '--json' && !values.has(token)) || Object.hasOwn(options, token)) throw Error('알 수 없거나 중복된 옵션입니다. workspace --help');
    options[token] = token === '--json' ? true : args[++i];
    if (options[token] === undefined || (typeof options[token] === 'string' && (!options[token].trim() || options[token].startsWith('--')))) throw Error('옵션 값이 필요합니다.');
  }
  const [kind, command, id] = positional;
  if (!['workspace', 'project'].includes(kind) || !['create', 'list', 'show'].includes(command)
    || positional.length !== (command === 'show' ? 3 : 2)) throw Error('create, list, show 명령과 인자를 확인해 주세요. workspace --help');
  const accepted = new Set(['--json', '--endpoint', '--server-id', '--target', '--timeout-ms',
    ...(command === 'create' ? ['--name'] : []), ...(kind === 'project' && command !== 'show' ? ['--workspace'] : [])]);
  if (Object.keys(options).some(key => !accepted.has(key))) throw Error('이 명령에서 사용할 수 없는 옵션입니다.');
  if (command === 'create' && !options['--name']) throw Error('--name이 필요합니다.');
  if (kind === 'project' && command !== 'show' && !options['--workspace']) throw Error('--workspace가 필요합니다.');
  for (const value of [id, options['--workspace']]) {
    if (value !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw Error('생성된 대상의 전체 UUID를 지정해 주세요.');
  }
  const operation = `${command === 'show' ? 'get' : command}${kind === 'workspace' ? 'Workspace' : 'Project'}${command === 'list' ? 's' : ''}`;
  const input = command === 'show' ? { id } : {
    ...(command === 'create' ? { name: options['--name'] } : {}),
    ...(kind === 'project' ? { workspaceId: options['--workspace'] } : {}),
  };
  return { operation, input, options };
}
