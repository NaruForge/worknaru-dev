import path from 'node:path';
import { lstatSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const schema = [
  `CREATE TABLE runs (
    id TEXT PRIMARY KEY NOT NULL,
    request_id TEXT UNIQUE NOT NULL,
    context_type TEXT NOT NULL CHECK(context_type IN ('standalone','workspace','project')),
    workspace_id TEXT,
    project_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('accepted','running','succeeded','failed','uncertain')),
    created_at TEXT NOT NULL,
    body TEXT NOT NULL CHECK(json_valid(body)),
    CHECK((context_type='standalone' AND workspace_id IS NULL AND project_id IS NULL)
      OR (context_type='workspace' AND workspace_id IS NOT NULL AND project_id IS NULL)
      OR (context_type='project' AND workspace_id IS NOT NULL AND project_id IS NOT NULL))
  ) STRICT`,
  'CREATE INDEX runs_by_context ON runs(context_type, workspace_id, project_id, created_at, id)',
];
const normalize = sql => sql.replace(/\s+/g, ' ').trim();
const decode = row => row ? JSON.parse(row.body) : null;

export function openModuleStore(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw Error('An absolute Module database path is required.');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { if (!lstatSync(filename + suffix).isFile()) throw Error('Module database must be a regular file.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    try {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version === 0 && !db.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").get()) {
        db.exec(schema.join(';') + '; PRAGMA user_version=1;');
      } else if (version !== 1) throw Error('Unsupported Module database schema.');
      const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all().map(row => normalize(row.sql ?? '')).sort();
      if (JSON.stringify(actual) !== JSON.stringify(schema.map(normalize).sort())
        || db.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok') throw Error('Invalid Module database schema or contents.');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const request = db.prepare('SELECT body FROM runs WHERE request_id=?');
    const insert = db.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING');
    const update = db.prepare('UPDATE runs SET status=?, body=? WHERE id=? AND status=?');
    const get = db.prepare('SELECT body FROM runs WHERE id=?');
    const list = db.prepare('SELECT body FROM runs WHERE context_type=? AND workspace_id IS ? AND project_id IS ? ORDER BY created_at,id');
    let closed = false;
    return {
      accept(run) {
        insert.run(run.id, run.requestId, run.context.type, run.context.workspaceId, run.context.projectId,
          run.status, run.createdAt, JSON.stringify(run));
        return decode(request.get(run.requestId));
      },
      transition(id, from, run) {
        if (update.run(run.status, JSON.stringify(run), id, from).changes !== 1) throw Error('Run transition conflict');
      },
      get(id) { return decode(get.get(id)); },
      list(context) { return list.all(context.type, context.workspaceId, context.projectId).map(decode); },
      recover() {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const row of db.prepare("SELECT body FROM runs WHERE status IN ('accepted','running')").all()) {
            const run = decode(row);
            const recovered = { ...run, status: 'uncertain', finishedAt: new Date().toISOString(),
              error: { code: 'interrupted', message: '실행 결과를 확정하지 못했습니다. 자동 재실행하지 않습니다.' } };
            update.run(recovered.status, JSON.stringify(recovered), run.id, run.status);
          }
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
      close() { if (!closed) { db.close(); closed = true; } },
    };
  } catch (error) { db.close(); throw error; }
}
