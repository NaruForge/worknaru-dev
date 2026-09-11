import { DatabaseSync } from 'node:sqlite';

/** One writer, atomic revisions. A second worker cannot overwrite a stale snapshot. */
export function openStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL)');
  const existing = db.prepare('SELECT revision, document FROM state WHERE id=1').get();
  let revision = existing?.revision ?? 0;
  return {
    load: () => existing ? JSON.parse(existing.document) : null,
    save(value) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (!revision) db.prepare('INSERT INTO state VALUES (1, 1, ?)').run(JSON.stringify(value));
        else {
          const updated = db.prepare('UPDATE state SET revision=revision+1, document=? WHERE id=1 AND revision=?').run(JSON.stringify(value), revision);
          if (updated.changes !== 1) throw new Error('Another worker changed the store');
        }
        db.exec('COMMIT'); revision++;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => db.close(),
  };
}
