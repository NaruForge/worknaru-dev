import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkspaceStore } from '../server/workspace-store.mjs';

// Independent fixture: the v1 DDL shipped before the schema-validation fix.
const versionOne = `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX projects_by_workspace ON projects(workspace_id, created_at, id);
  PRAGMA user_version=1;
`;
const workspace = { id: '11111111-1111-4111-8111-111111111111', name: 'Preserved workspace', createdAt: '2026-09-15T00:00:00.000Z' };
const project = { id: '22222222-2222-4222-8222-222222222222', workspaceId: workspace.id, name: 'Preserved project', createdAt: workspace.createdAt };

function databaseFile(t) {
  const root = process.env.WORKNARU_TEST_ROOT || path.join(os.tmpdir(), 'worknaru-tests');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'workspace-schema-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'worknaru-domain.sqlite');
}
function seed(file, sql, journal = 'DELETE', data = true) {
  const db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA foreign_keys=OFF; PRAGMA journal_mode=${journal};`);
    db.exec(sql);
    if (data) {
      db.prepare('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)').run(workspace.id, workspace.name, workspace.createdAt);
      db.prepare('INSERT INTO projects (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(project.id, project.workspaceId, project.name, project.createdAt);
    }
  } finally { db.close(); }
}
function snapshot(file) {
  const directory = path.dirname(file);
  return Object.fromEntries(readdirSync(directory).sort().map(name => [name, readFileSync(path.join(directory, name))]));
}
function assertRejectedUnchanged(file, pattern = /Unrecognized workspace database schema/) {
  const before = snapshot(file);
  assert.throws(() => {
    // Close an erroneously accepted store before failing, also on Windows.
    const store = openWorkspaceStore(file);
    store.close();
  }, pattern);
  assert.deepEqual(snapshot(file), before, 'Rejected database and sidecar contents must not change');
}

const malformed = [
  ['missing primary and foreign keys (review reproduction)', versionOne.replaceAll('PRIMARY KEY ', '').replace(' REFERENCES workspaces(id) ON DELETE RESTRICT', '')],
  ['missing workspace primary key', versionOne.replace('PRIMARY KEY ', '')],
  ['missing project primary key', versionOne.replace('CREATE TABLE projects (\n    id TEXT PRIMARY KEY', 'CREATE TABLE projects (\n    id TEXT')],
  ['missing foreign key', versionOne.replace(' REFERENCES workspaces(id) ON DELETE RESTRICT', '')],
  ['nullable membership', versionOne.replace('workspace_id TEXT NOT NULL', 'workspace_id TEXT')],
  ['changed foreign-key action', versionOne.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE')],
  ['weakened CHECK', versionOne.replaceAll('BETWEEN 1 AND 200', 'BETWEEN 0 AND 200')],
  ['missing CHECK', versionOne.replaceAll(' CHECK(length(id)=36)', '')],
  ['missing STRICT', versionOne.replaceAll(') STRICT;', ');')],
  ['wrong column type', versionOne.replaceAll('name TEXT', 'name BLOB').replaceAll(') STRICT;', ');')],
  ['missing index', versionOne + 'DROP INDEX projects_by_workspace;'],
  ['different index columns', versionOne.replace('ON projects(workspace_id, created_at, id)', 'ON projects(workspace_id, id)')],
  ['unexpected trigger', versionOne + 'CREATE TRIGGER discard_project BEFORE INSERT ON projects BEGIN SELECT RAISE(IGNORE); END;'],
  ['unrelated table', versionOne + 'CREATE TABLE extra (value TEXT);'],
];
for (const journal of ['DELETE', 'WAL']) {
  for (const [label, sql] of malformed) {
    test(`v1 ${label} is rejected without changes (${journal})`, t => {
      const file = databaseFile(t);
      seed(file, sql, journal);
      assertRejectedUnchanged(file);
    });
  }
  test(`the pre-fix v1 schema reopens and retains constraints (${journal})`, t => {
    const file = databaseFile(t);
    seed(file, versionOne, journal);
    const store = openWorkspaceStore(file);
    try {
      assert.deepEqual(store.findWorkspace(workspace.id), workspace);
      assert.deepEqual(store.findProject(project.id), project);
      assert.throws(() => store.insertWorkspace(workspace), /UNIQUE/);
      assert.throws(() => store.insertProject(project), /UNIQUE/);
      assert.throws(() => store.insertProject({ ...project, id: crypto.randomUUID(), workspaceId: crypto.randomUUID() }), /FOREIGN KEY/);
      assert.throws(() => store.insertWorkspace({ ...workspace, id: crypto.randomUUID(), name: '' }), /CHECK/);
      assert.deepEqual(store.listProjects(workspace.id), [project]);
    } finally { store.close(); }
  });
}

test('v1 missing required table is rejected before journal changes', t => {
  const file = databaseFile(t);
  seed(file, 'CREATE TABLE workspaces (id TEXT, name TEXT, created_at TEXT); PRAGMA user_version=1;', 'DELETE', false);
  assertRejectedUnchanged(file);
});

test('existing orphan rows are rejected without repair even with correct v1 DDL', t => {
  const file = databaseFile(t);
  seed(file, versionOne);
  const db = new DatabaseSync(file);
  try { db.exec('PRAGMA foreign_keys=OFF; DELETE FROM workspaces;'); } finally { db.close(); }
  assertRejectedUnchanged(file, /Invalid workspace database contents/);
});

test('existing CHECK violations are rejected without repair even with correct v1 DDL', t => {
  const file = databaseFile(t);
  seed(file, versionOne);
  const db = new DatabaseSync(file);
  try { db.exec("PRAGMA ignore_check_constraints=ON; UPDATE workspaces SET name='';"); } finally { db.close(); }
  assertRejectedUnchanged(file, /Invalid workspace database contents/);
});

test('new stores initialize, close and reopen with the validated v1 schema', t => {
  const file = databaseFile(t);
  const first = openWorkspaceStore(file);
  try { first.insertWorkspace(workspace); first.insertProject(project); } finally { first.close(); }
  const second = openWorkspaceStore(file);
  try {
    assert.deepEqual(second.listWorkspaces(), [workspace]);
    assert.deepEqual(second.listProjects(workspace.id), [project]);
  } finally { second.close(); }
});
