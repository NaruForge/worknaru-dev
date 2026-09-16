export const moduleHelp = `Module 사용법 (pnpm exec worknaru ...)
  module list
  module run text-stats --text <텍스트> --request-id <UUID> <실행 대상>
  run show <Run UUID>
  run list <실행 대상>

실행 대상: --standalone 또는 --workspace <UUID> 또는 --project <UUID> 중 하나.
--request-id는 호출자가 생성한 전체 UUID. 응답 유실 시 같은 ID·입력·대상으로 다시 확인합니다.
text-stats: 최대 100000 UTF-16 단위 입력, Unicode code point 수와 CRLF/CR/LF 줄 수.
빈 문자열은 0글자·0줄. 줄바꿈 문자도 글자 수에 포함합니다.
--json: JSON 한 문서. --help, -h: 도움말.
명시적 연결: --endpoint URL --server-id ID [--target ID] [--timeout-ms 밀리초]
기존 WORKNARU_* 연결 설정을 적용하며 생략 시 관리형 로컬 환경을 사용합니다.
실행은 자동 재시도하지 않습니다. uncertain 기록은 같은 ID로 재실행되지 않습니다.
종료 코드: 0 성공/접수/조회, 1 실행 실패/미확정/연결 실패, 2 입력/설정 오류, 3 내부 오류.
`;
export function parseModuleArgs(args) {
  const positional = [], options = {};
  const flags = ['--json', '--standalone'];
  const values = ['--text', '--request-id', '--workspace', '--project', '--endpoint', '--server-id', '--target', '--timeout-ms'];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('-')) { positional.push(token); continue; }
    if ((!flags.includes(token) && !values.includes(token)) || Object.hasOwn(options, token)) throw Error('알 수 없거나 중복된 옵션입니다. module --help');
    options[token] = flags.includes(token) ? true : args[++i];
    if (options[token] === undefined || (!flags.includes(token) && token !== '--text' && (!options[token].trim() || options[token].startsWith('--')))) throw Error('옵션 값이 필요합니다.');
  }
  const [kind, action, id] = positional;
  const operation = kind === 'module' ? ({ list: 'list', run: 'execute' })[action] : kind === 'run' ? ({ show: 'getRun', list: 'listRuns' })[action] : undefined;
  if (!operation || positional.length !== (['execute', 'getRun'].includes(operation) ? 3 : 2)) throw Error('명령과 인자를 확인해 주세요. module --help');
  const targeting = ['execute', 'listRuns'].includes(operation);
  const accepted = new Set(['--json', '--endpoint', '--server-id', '--target', '--timeout-ms',
    ...(targeting ? ['--standalone', '--workspace', '--project'] : []), ...(operation === 'execute' ? ['--text', '--request-id'] : [])]);
  if (Object.keys(options).some(key => !accepted.has(key))) throw Error('이 명령에서 사용할 수 없는 옵션입니다.');
  if (targeting && ['--standalone', '--workspace', '--project'].filter(key => Object.hasOwn(options, key)).length !== 1) throw Error('실행 대상을 정확히 하나 지정해 주세요.');
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  for (const value of [options['--workspace'], options['--project'], options['--request-id'], operation === 'getRun' ? id : undefined]) {
    if (value !== undefined && !uuid(value)) throw Error('전체 UUID를 지정해 주세요.');
  }
  if (operation === 'execute' && (!options['--request-id'] || !Object.hasOwn(options, '--text'))) throw Error('--text와 --request-id가 필요합니다.');
  const target = options['--standalone'] ? { type: 'standalone' } : options['--workspace'] ? { type: 'workspace', workspaceId: options['--workspace'] } : { type: 'project', projectId: options['--project'] };
  const input = operation === 'execute' ? { moduleId: id, requestId: options['--request-id'], input: { text: options['--text'] }, target }
    : operation === 'getRun' ? { id } : operation === 'listRuns' ? { target } : {};
  return { operation, input, options };
}
