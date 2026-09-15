import path from 'node:path';
import { lstatSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// These are the only application-owned v1 objects. Check full definitions, not
// just columns: table_info alone cannot verify CHECK clauses or FK actions.
const schema = [
  `CREATE TABLE workspaces (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    created_at TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    created_at TEXT NOT NULL
  ) STRICT`,
  'CREATE INDEX projects_by_workspace ON projects(workspace_id, created_at, id)',
];
const normalizeSql = sql => sql.replace(/\s+/g, ' ').trim();
const expectedSchema = schema.map(normalizeSql).sort();

function validateSchema(db) {
  // This deliberately accepts only the app-generated v1 DDL (ignoring layout),
  // not arbitrary semantically equivalent SQL or added triggers/views/tables.
  const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
    .all().map(row => normalizeSql(row.sql ?? '')).sort();
  if (actual.length !== expectedSchema.length || actual.some((sql, i) => sql !== expectedSchema[i])) {
    throw new Error('Unrecognized workspace database schema.');
  }
  if (db.prepare('PRAGMA quick_check(1)').get().quick_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').get()) {
    throw new Error('Invalid workspace database contents.');
  }
}

/** SQLite belongs to the Node app, never to browser Core or the Paseo adapter. */
export function openWorkspaceStore(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) {
    throw new TypeError('An explicit absolute workspace database path is required.');
  }
  // Owned roots are checked by the composition root. Do not follow redirected DB files.
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      if (!lstatSync(filename + suffix).isFile()) throw new Error('Workspace database must be a regular file.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    // Reject unrelated/unsupported databases rather than migrating or resetting them.
    db.exec('BEGIN IMMEDIATE');
    try {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version === 0) {
        if (db.prepare("SELECT name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'").get()) {
          throw new Error('Unrecognized workspace database schema.');
        }
        db.exec(schema.join(';') + '; PRAGMA user_version=1;');
      } else if (version !== 1) {
        throw new Error('Unsupported workspace database schema.');
      }
      // Validate under the initialization lock, before persistent PRAGMA changes.
      validateSchema(db);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    const insertWorkspace = db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)');
    const findWorkspace = db.prepare('SELECT id, name, created_at AS createdAt FROM workspaces WHERE id=?');
    const listWorkspaces = db.prepare('SELECT id, name, created_at AS createdAt FROM workspaces ORDER BY created_at, id');
    const insertProject = db.prepare('INSERT INTO projects (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)');
    const findProject = db.prepare('SELECT id, workspace_id AS workspaceId, name, created_at AS createdAt FROM projects WHERE id=?');
    const listProjects = db.prepare('SELECT id, workspace_id AS workspaceId, name, created_at AS createdAt FROM projects WHERE workspace_id=? ORDER BY created_at, id');
    let closed = false;
    return {
      insertWorkspace(value) { insertWorkspace.run(value.id, value.name, value.createdAt); },
      findWorkspace(id) { const row = findWorkspace.get(id); return row ? { ...row } : null; },
      listWorkspaces() { return listWorkspaces.all().map(row => ({ ...row })); },
      insertProject(value) { insertProject.run(value.id, value.workspaceId, value.name, value.createdAt); },
      findProject(id) { const row = findProject.get(id); return row ? { ...row } : null; },
      listProjects(workspaceId) { return listProjects.all(workspaceId).map(row => ({ ...row })); },
      close() { if (!closed) { db.close(); closed = true; } },
    };
  } catch (error) { db.close(); throw error; }
}
