import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { openStore } from '../server/store.mjs';

test('SQLite survives reopen and refuses an obsolete concurrent writer', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'worknaru-agent-store-'));
  const filename = path.join(folder, 'state.sqlite');
  const a = openStore(filename); a.save({ settings: { sendMode: 'queue' }, requests: [{ id: 'durable' }] });
  const b = openStore(filename);
  try {
    assert.equal(b.load().requests[0].id, 'durable');
    a.save({ requests: [{ id: 'newer' }] });
    assert.throws(() => b.save({ requests: [] }), /Another worker/);
  } finally { a.close(); b.close(); }
  const reopened = openStore(filename);
  try { assert.equal(reopened.load().requests[0].id, 'newer'); } finally { reopened.close(); await rm(folder, { recursive: true }); }
});
