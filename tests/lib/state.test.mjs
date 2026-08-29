import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
import { createDefaultState, CURRENT_SCHEMA_VERSION } from '../../scripts/lib/schema.mjs';
import { readState, writeState, updateState, migrateState } from '../../scripts/lib/state.mjs';
import { readRawState, migrateStateFile, readMigratedState } from '../../scripts/lib/state.mjs';

test('readState returns null when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.equal(await readState(dir), null);
  });
});

test('writeState then readState round-trips', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
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

function v1State() {
  return {
    schema_version: 1,
    plugin_version: '0.1.0',
    hackathon: null,
    project: null,
    phases: Object.fromEntries(
      ['recon', 'brainstorm', 'describe', 'stack', 'architect', 'requirements',
       'spec', 'build', 'ship', 'review', 'submit'].map((p) => [p, { status: 'not_started' }]),
    ),
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

test('migrateState upgrades a v1 state by adding deliverables', () => {
  const { state, migrated, from } = migrateState(v1State());
  assert.equal(migrated, true);
  assert.equal(from, 1);
  assert.equal(state.schema_version, 3);
  assert.deepEqual(state.deliverables, { submission_requirements: [], bonus_content: [] });
});

test('migrateState preserves everything else in a v1 state', () => {
  const before = v1State();
  before.budget.total_hours = 48;
  before.phases.recon = { status: 'approved', artifacts: ['.hackathon/brief.md'] };
  const { state } = migrateState(before);
  assert.equal(state.budget.total_hours, 48);
  assert.deepEqual(state.phases.recon, { status: 'approved', artifacts: ['.hackathon/brief.md'] });
});

test('migrateState is idempotent on an already-migrated state', () => {
  const once = migrateState(v1State()).state;
  const { state, migrated } = migrateState(once);
  assert.equal(migrated, false);
  assert.deepEqual(state, once);
});

test('readRawState parses a v1 file that readState would reject', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), JSON.stringify(v1State()), 'utf8');
    await assert.rejects(() => readState(dir), /schema_version/);
    const raw = await readRawState(dir);
    assert.equal(raw.schema_version, 1);
  });
});

test('readRawState returns null when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.equal(await readRawState(dir), null);
  });
});

test('migrateStateFile upgrades a v1 file on disk and reports it', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), JSON.stringify(v1State()), 'utf8');

    const result = await migrateStateFile(dir);
    assert.equal(result.migrated, true);
    assert.equal(result.from, 1);

    const after = await readState(dir);        // now passes validation
    assert.equal(after.schema_version, 3);
    assert.deepEqual(after.deliverables, { submission_requirements: [], bonus_content: [] });
  });
});

test('migrateStateFile is a no-op on a current-version file', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const before = await readFile(path.join(dir, '.hackathon/state.json'), 'utf8');
    const result = await migrateStateFile(dir);
    assert.equal(result.migrated, false);
    assert.equal(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'), before);
  });
});

test('migrateStateFile reports nothing to do when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.deepEqual(await migrateStateFile(dir), { migrated: false, from: null });
  });
});

// M5 (review round 1): readMigratedState is newly exported (Fix 7/I2) with no unit test of
// its own -- only exercised indirectly through applyArchitecture/applyStack's dry-run path.

test('readMigratedState returns null when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.equal(await readMigratedState(dir), null);
  });
});

test('readMigratedState migrates a v1 file in memory without writing to disk', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.dirname(statePath(dir)), { recursive: true });
    const raw = JSON.stringify(v1State());
    await writeFile(statePath(dir), raw, 'utf8');

    const state = await readMigratedState(dir);
    assert.equal(state.schema_version, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(state.deliverables, { submission_requirements: [], bonus_content: [] });

    const stillOnDisk = await readFile(statePath(dir), 'utf8');
    assert.equal(stillOnDisk, raw, 'readMigratedState must not touch the file at all');
  });
});

test('readMigratedState throws when the migrated shape is still invalid', async () => {
  await withTmpDir(async (dir) => {
    const bad = v1State();
    bad.mode = 'not-a-real-mode'; // migration adds schema_version/deliverables; it does not
                                  // repair a pre-existing invalid field like this one
    await mkdir(path.dirname(statePath(dir)), { recursive: true });
    await writeFile(statePath(dir), JSON.stringify(bad), 'utf8');

    await assert.rejects(() => readMigratedState(dir), /valid win-hackathon state/i);
  });
});

test('v2 state migrates to v3 additively', () => {
  const v2 = {
    schema_version: 2,
    plugin_version: '0.1.0',
    hackathon: null,
    project: { name: 'Kintwadi', selected_idea: 'i1' },
    phases: {},
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
    deliverables: { submission_requirements: [{ id: 'demo-video', status: 'done' }], bonus_content: [] },
  };
  const { state, migrated, from } = migrateState(v2);
  assert.equal(migrated, true);
  assert.equal(from, 2);
  assert.equal(state.schema_version, 3);
  assert.deepEqual(state.project, { name: 'Kintwadi', selected_idea: 'i1' },
    'migration is additive — it must not invent stack or ref fields');
  assert.equal(state.deliverables.submission_requirements[0].status, 'done',
    'existing deliverable statuses survive migration');
});

test('v1 migrates all the way to v3 in one call', () => {
  const v1 = { schema_version: 1, phases: {}, project: null };
  const { state } = migrateState(v1);
  assert.equal(state.schema_version, 3);
  assert.ok(state.deliverables, 'the v1->v2 step still runs');
});

test('migration is idempotent', () => {
  const once = migrateState({ schema_version: 1, phases: {}, project: null }).state;
  const twice = migrateState(once);
  assert.equal(twice.migrated, false);
  assert.deepEqual(twice.state, once);
});

test('still refuses a version newer than it knows', () => {
  assert.throws(() => migrateState({ schema_version: 99 }), /newer than supported/);
});
