import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
import { createDefaultState, CURRENT_SCHEMA_VERSION } from '../../scripts/lib/schema.mjs';
import { readState, writeState, updateState, migrateState } from '../../scripts/lib/state.mjs';

test('readState returns null when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.equal(await readState(dir), null);
  });
});

test('writeState then readState round-trips', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi' };
    await writeState(dir, s);
    const back = await readState(dir);
    assert.equal(back.project.name, 'Kintwadi');
    assert.equal(back.schema_version, CURRENT_SCHEMA_VERSION);
  });
});

test('writeState leaves no temp files behind', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const entries = await readdir(path.dirname(statePath(dir)));
    assert.deepEqual(entries.filter((e) => e.includes('.tmp')), []);
  });
});

test('writeState refuses to persist an invalid state', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'bogus';
    await assert.rejects(() => writeState(dir, s), /invalid state/i);
    assert.equal(await readState(dir), null, 'nothing should have been written');
  });
});

test('updateState applies a mutation and persists it', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    await updateState(dir, (s) => {
      s.phases.recon.status = 'approved';
      s.phases.recon.approved_at = '2026-08-21T00:00:00Z';
      return s;
    });
    const back = await readState(dir);
    assert.equal(back.phases.recon.status, 'approved');
  });
});

test('updateState throws when there is no state to update', async () => {
  await withTmpDir(async (dir) => {
    await assert.rejects(() => updateState(dir, (s) => s), /no state/i);
  });
});

test('readState throws a clear error on corrupt JSON', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.dirname(statePath(dir)), { recursive: true });
    await writeFile(statePath(dir), '{ not json', 'utf8');
    await assert.rejects(() => readState(dir), /could not be parsed/i);
  });
});

// Regression: readState() used to hand back whatever JSON.parse produced without
// checking it was a valid win-hackathon state. A hand-edited state.json that is
// syntactically valid JSON but semantically malformed (e.g. artifacts written as a
// bare string instead of an array — the natural typo when following the retrofit
// instructions in commands/init.md) passed straight through to callers like
// resolve-next.mjs, which then crashed or produced nonsense. readState must now
// validate what it reads, the same way writeState already validates what it writes.
test('readState throws a clear error when JSON is valid but the state shape is not (bad artifacts)', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'approved';
    s.phases.recon.artifacts = 'docs/architecture.md'; // should be an array of strings
    await mkdir(path.dirname(statePath(dir)), { recursive: true });
    // Bypass writeState (which would refuse this) to simulate a hand-edited file.
    await writeFile(statePath(dir), JSON.stringify(s, null, 2), 'utf8');
    await assert.rejects(() => readState(dir), /valid win-hackathon state/i);
  });
});

test('readState throws a clear error when a phase status is hand-edited to something invalid', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'done'; // not one of PHASE_STATUSES
    await mkdir(path.dirname(statePath(dir)), { recursive: true });
    await writeFile(statePath(dir), JSON.stringify(s, null, 2), 'utf8');
    await assert.rejects(() => readState(dir), /valid win-hackathon state/i);
  });
});

test('migrateState reports no migration for a current-version state', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  const r = migrateState(s);
  assert.equal(r.migrated, false);
  assert.equal(r.from, CURRENT_SCHEMA_VERSION);
});

test('migrateState refuses to downgrade a newer schema', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.schema_version = CURRENT_SCHEMA_VERSION + 1;
  assert.throws(() => migrateState(s), /newer/i);
});
