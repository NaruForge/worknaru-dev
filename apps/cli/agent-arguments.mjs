export const agentHelp = `Agent 사용법 (pnpm exec worknaru ...)
  agent setup                         최초 1회 준비 (개발 환경 정지 후)
  agent create [--name 이름] [--cwd 폴더] [--model 모델]
  agent list [--archived]
  agent show <이름 또는 ID>
  agent send <agent> "메시지" [--queue | --steer] [--no-wait]
  agent wait <agent> [--request 요청ID] [--wait-timeout 초]
  agent history <agent> [--all]
  agent queue list <agent>
  agent queue cancel <agent> <요청ID>
  agent queue discard <agent> <요청ID> --yes  불명확한 요청의 자동 재실행 포기
  agent queue resume <agent>
  agent permissions <agent>
  agent permission respond <agent> <권한ID> --allow|--deny [--action ID] [--answers JSON]
  agent archive <agent> [--yes]
  settings get send-mode
  settings set send-mode queue|steer

이름이 겹치면 agent list에서 전체 ID 또는 유일한 4자 이상 접두사를 선택하세요.
send는 기본 600초 대기합니다. --wait-timeout은 관찰만 제한하며 작업을 중단하지 않습니다.
--id로 생성/전송 요청 ID를 지정할 수 있습니다. 기본은 자동 생성입니다.
--json: 질문 없이 JSON 한 문서. --no-wait: 접수 후 반환. Ctrl+C: 관찰만 종료.
명시적 연결: --endpoint URL --server-id ID (기존 WORKNARU_* 설정도 적용)
`;

const flags = new Set(['--json', '--yes', '--no-wait', '--queue', '--steer', '--archived', '--allow', '--deny', '--all']);
const values = new Set(['--name', '--cwd', '--model', '--id', '--request', '--wait-timeout', '--action', '--answers', '--endpoint', '--server-id', '--target', '--timeout-ms']);
export function parseAgentArgs(args) {
  const positional = []; const options = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) { positional.push(token); continue; }
    if ((!flags.has(token) && !values.has(token)) || Object.hasOwn(options, token)) throw Error('알 수 없거나 중복된 옵션입니다.');
    options[token] = flags.has(token) ? true : args[++i];
    if (options[token] === undefined || (typeof options[token] === 'string' && options[token].startsWith('--'))) throw Error('옵션 값이 필요합니다.');
  }
  if (options['--queue'] && options['--steer']) throw Error('--queue와 --steer는 함께 사용할 수 없습니다.');
  if (options['--allow'] && options['--deny']) throw Error('승인과 거부 중 하나만 선택해 주세요.');
  if (options['--wait-timeout'] && (!/^\d+$/.test(options['--wait-timeout']) || Number(options['--wait-timeout']) < 1 || Number(options['--wait-timeout']) > 86400)) throw Error('대기 시간은 1~86400초 정수입니다.');
  const allowed = {
    create: ['--name', '--cwd', '--model', '--id'], list: ['--archived'], show: [], permissions: [], history: ['--all'],
    send: ['--id', '--queue', '--steer', '--no-wait', '--wait-timeout'], wait: ['--request', '--wait-timeout'],
    archive: ['--yes'], 'queue list': [], 'queue cancel': [], 'queue resume': [], 'queue discard': ['--yes'],
    'permission respond': ['--allow', '--deny', '--action', '--answers'], settings: [],
  };
  const command = positional[0] === 'settings' ? 'settings' : ['queue', 'permission'].includes(positional[1]) ? positional.slice(1, 3).join(' ') : positional[1];
  const accepted = new Set(['--json', '--endpoint', '--server-id', '--target', '--timeout-ms', ...(allowed[command] ?? [])]);
  if (Object.keys(options).some(option => !accepted.has(option))) throw Error('이 명령에서 사용할 수 없는 옵션입니다. agent --help');
  return { positional, options };
}
