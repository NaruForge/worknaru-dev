import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { containsPath, DataError, samePath } from '../../packages/dev-environment/paths.mjs';
import { assertStorage } from '../../packages/dev-environment/storage.mjs';
import { resetPlan } from './data-reset.mjs';

export async function openFolder(directory) {
  if (process.platform !== 'win32') throw new DataError('unsupported_platform', '폴더 열기는 Windows에서 지원합니다.');
  await new Promise((resolve, reject) => {
    // No shell or caller-supplied executable. This action explicitly opens a visible folder.
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [directory],
      { shell: false, windowsHide: false, detached: true, stdio: 'ignore' });
    child.once('error', () => reject(new DataError('open_failed', '탐색기를 열지 못했습니다. 경로를 확인해 주세요.')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export function createDataManagement({ paths, serverId, verifyOwner, listAgents, restart, open = openFolder, env = process.env }) {
  let preview;
  let resetId;
  const entries = new Map();
  async function snapshot() {
    await verifyOwner();
    await assertStorage(paths);
    const specifications = [
      ['root', '전용 데이터 루트', paths.dataHome, 'directory', 'Worknaru', '전용 실행 데이터 전체'],
      ['config', 'Daemon 설정', paths.config, 'file', 'Worknaru / Paseo', '전용 설정과 플러그인 구성'],
      ['identity', '서버 ID', paths.serverId, 'file', 'Paseo', '실행 환경 식별자'],
      ['keys', 'Daemon 인증 키', path.join(paths.dataHome, 'daemon-keypair.json'), 'file', 'Paseo', '인증 키 파일의 위치만 표시'],
      ['agents', 'Agent 등록 정보', path.join(paths.dataHome, 'agents'), 'directory', 'Paseo', '이름·모델·작업 폴더·Provider 세션 연결'],
      ['projects', 'Paseo 프로젝트 등록', path.join(paths.dataHome, 'projects'), 'directory', 'Paseo', '실행 기반의 프로젝트·workspace 등록'],
      ['queue', '메시지·대기열 DB', paths.agentState, 'file', 'Worknaru', '전송 요청·결과·공유 설정. 전체 대화 기록 DB가 아닙니다.'],
      ['wal', 'DB 변경 기록', `${paths.agentState}-wal`, 'file', 'SQLite', 'DB 부속 파일'],
      ['shm', 'DB 공유 메모리', `${paths.agentState}-shm`, 'file', 'SQLite', 'DB 부속 파일'],
      ['daemonLog', 'Daemon 로그', paths.log, 'file', 'Worknaru / Paseo', '실행 진단 로그'],
      ['launcherLog', '시작 로그', paths.launcherLog, 'file', 'Worknaru', 'Daemon 시작 출력'],
      ['runnerLog', '관리 실행기 로그', paths.runnerLog, 'file', 'Worknaru', '관리 실행기 출력'],
      ['buildLog', '빌드 로그', paths.buildLog, 'file', 'Worknaru', '최근 개발 빌드 출력'],
      ['worktrees', '관리 worktree', paths.worktrees, 'directory', 'Paseo', '전용 환경이 관리하는 Git 작업 파일'],
      ['tmp', '임시 파일·웹 자산', paths.temporary, 'directory', 'Worknaru / Paseo', '실행별 임시 파일과 웹 제공 폴더'],
      ['source', '제품 소스', paths.repository, 'directory', '사용자 / Git', '제품 코드·의존 패키지·빌드 산출물', false],
      ['paseoHome', '개인 Paseo', env.PASEO_HOME || path.join(os.homedir(), '.paseo'), 'directory', 'Paseo', '개인 설정·로그인·자체 기록', false],
      ['codexHome', 'Codex 자체 저장소', env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'directory', 'Codex', 'Provider 로그인·세션·대화 기록. Worknaru 초기화로 삭제하지 않습니다.', false],
    ];
    let projectsError = null;
    try {
      const agents = await listAgents();
      const folders = [...new Set(agents.map(agent => agent.cwd))];
      for (const cwd of folders) specifications.push([
        `working-${createHash('sha256').update(cwd).digest('hex').slice(0, 24)}`, 'Agent 실제 작업 폴더', cwd, 'directory', '사용자 / Agent',
        agents.filter(agent => agent.cwd === cwd).map(agent => agent.name).join(', '), containsPath(paths.dataHome, cwd),
      ]);
    } catch { projectsError = 'Agent 작업 폴더를 조회하지 못했습니다. 다시 불러와 주세요.'; }
    const nextEntries = new Map();
    const items = await Promise.all(specifications.map(async ([id, label, location, kind, manager, description, reset = true]) => {
      let state = 'present'; let directory = null;
      try {
        const info = await lstat(location);
        if (info.isSymbolicLink() || (kind === 'directory' ? !info.isDirectory() : !info.isFile())) state = 'unavailable';
        else directory = await realpath(kind === 'directory' ? location : path.dirname(location));
      } catch (error) { state = error.code === 'ENOENT' ? 'missing' : 'unavailable'; }
      if (directory) nextEntries.set(id, { location, kind, directory });
      return { id, label, path: location, kind, manager, description, reset, state, canOpen: !!directory && process.platform === 'win32' };
    }));
    entries.clear(); for (const [id, item] of nextEntries) entries.set(id, item);
    return { serverId: serverId(), host: os.hostname(), dataRoot: paths.dataHome, source: paths.source, items, projectsError };
  }
  async function plan() {
    await verifyOwner();
    // Preview verifies this running controller; deletion still uses the real stopped check.
    const value = await resetPlan(paths, { stopped: verifyOwner });
    preview = value.blockers.length ? null : { token: randomUUID(), serverId: serverId(), expires: Date.now() + 60000 };
    return { dataRoot: value.dataRoot, items: value.items, blockers: value.blockers, token: preview?.token ?? null };
  }
  return {
    complete() { resetId = null; preview = null; entries.clear(); },
    snapshot,
    preview: plan,
    async open({ id }) {
      await verifyOwner();
      const item = entries.get(id);
      if (!item) throw new DataError('unknown_path', '목록을 다시 불러온 뒤 폴더를 선택해 주세요.');
      const info = await lstat(item.location).catch(() => null);
      if (!info || info.isSymbolicLink() || (item.kind === 'directory' ? !info.isDirectory() : !info.isFile())
        || !samePath(await realpath(item.kind === 'directory' ? item.location : path.dirname(item.location)), item.directory)) {
        throw new DataError('path_changed', '저장 경로가 없어졌거나 변경됐습니다. 목록을 다시 불러와 주세요.');
      }
      await open(item.directory);
      return { opened: true };
    },
    async reset({ token, id }) {
      if (resetId === id) return { accepted: true, id };
      if (resetId) throw new DataError('operation_busy', '초기화가 이미 진행 중입니다.');
      await verifyOwner();
      if (!preview || token !== preview.token || Date.now() > preview.expires || preview.serverId !== serverId()) {
        throw new DataError('preview_expired', '초기화 미리보기가 만료됐습니다. 다시 확인해 주세요.');
      }
      preview = null; resetId = id;
      // The controller owns the continuation after the requesting Daemon exits.
      try { await restart(id); } catch (error) { resetId = null; throw error; }
      return { accepted: true, id };
    },
  };
}
