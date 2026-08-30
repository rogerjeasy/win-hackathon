import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applySpec } from '../../scripts/lib/spec-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
import { resolveNext } from '../../scripts/lib/resolve-next.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';
import { writeV1State } from '../helpers/v1-state.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

const okExec = async () => ({ code: 0, stdout: '', stderr: '' });
const deadExec = async () => ({ code: 127, stdout: '', stderr: 'command not found' });

async function seeded(root) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(root, s);
}

async function payloads() {
  return { requirements: await fx('h0-requirements.json'), architecture: await fx('h0-architecture.json') };
}

test('it writes the triad for every must-have and the proposals', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { artifacts, openspec } = await applySpec(root, { ...(await payloads()), exec: okExec });

    assert.equal(openspec.status, 'written');
    for (const dir of ['0001-shared-care-record', '0002-medication-safety']) {
      for (const f of ['requirements.md', 'design.md', 'tasks.md']) {
        const p = path.join(root, '.hackathon/specs', dir, f);
        assert.ok(await readFile(p, 'utf8'), `${dir}/${f} was not written`);
      }
    }
    assert.ok(artifacts.some((a) => a.includes('openspec/changes')));

    const after = await readState(root);
    assert.equal(after.phases.spec.status, 'awaiting_approval');
    assert.deepEqual(after.phases.spec.artifacts, ['.hackathon/specs'],
      'only the specs directory is declared — openspec/ may legitimately be absent');
  });
});

test('an unreachable OpenSpec still writes the triad and reports deferred', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { openspec } = await applySpec(root, { ...(await payloads()), exec: deadExec });

    assert.equal(openspec.status, 'deferred');
    assert.ok(openspec.command.includes('@fission-ai/openspec'));

    const dirs = await readdir(path.join(root, '.hackathon/specs'));
    assert.equal(dirs.length, 2, 'the Kiro triad does not depend on the CLI');

    const after = await readState(root);
    assert.equal(after.phases.spec.status, 'awaiting_approval',
      'a deferred optional tool must not block a phase whose own outputs are complete');
  });
});

test('it refuses to run when requirements are invalid', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const p = await payloads();
    p.requirements.features[0].scenarios = [];
    await assert.rejects(() => applySpec(root, { ...p, exec: okExec }), /refusing to apply/);
  });
});

test('a spec folder from a dropped feature is reported, not deleted', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { mkdir, writeFile } = await import('node:fs/promises');
    const stale = path.join(root, '.hackathon/specs', '0009-dropped-feature');
    await mkdir(stale, { recursive: true });
    await writeFile(path.join(stale, 'tasks.md'), '# old\n', 'utf8');

    const { skipped } = await applySpec(root, { ...(await payloads()), exec: okExec });
    assert.ok(skipped.some((s) => s.includes('0009-dropped-feature')));
    assert.ok(await readFile(path.join(stale, 'tasks.md'), 'utf8'),
      'a folder the user may have edited is left in place');
  });
});

test('--dry-run writes nothing and runs no command', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    let called = false;
    const spyExec = async () => { called = true; return { code: 0, stdout: '', stderr: '' }; };
    const { artifacts } = await applySpec(root, { ...(await payloads()), exec: spyExec, dryRun: true });
    assert.equal(called, false);
    assert.ok(artifacts.length > 0);
    const missing = await readdir(path.join(root, '.hackathon/specs')).then(() => false).catch(() => true);
    assert.equal(missing, true);
  });
});

test('a rerun is idempotent', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const p = await payloads();
    await applySpec(root, { ...p, exec: okExec });
    const before = await readFile(path.join(root, '.hackathon/specs/0001-shared-care-record/tasks.md'), 'utf8');
    await applySpec(root, { ...p, exec: okExec });
    const after = await readFile(path.join(root, '.hackathon/specs/0001-shared-care-record/tasks.md'), 'utf8');
    assert.equal(after, before);
  });
});

// --- a dry run must not migrate state.json to disk --------------------------------------
//
// Same class of defect Fix 7 corrected in applyArchitecture(), I2 corrected in applyStack(),
// and the equivalent fix in applyRequirements(): applySpec() must not call
// migrateStateFile(root) unconditionally before checking dryRun, or an old-schema
// state.json gets rewritten to the current schema even on a dry run, breaking the
// "filesystem is exactly as it was" guarantee.
test('--dry-run on an old-schema state.json leaves the file byte-for-byte untouched', async () => {
  await withTmpDir(async (root) => {
    await writeV1State(root, (s) => {
      s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    });
    const rawBefore = await readFile(statePath(root), 'utf8');

    const { artifacts } = await applySpec(root, { ...(await payloads()), exec: okExec, dryRun: true });
    assert.ok(artifacts.length > 0, 'the preview must still be computable from the migrated shape');

    const rawAfter = await readFile(statePath(root), 'utf8');
    assert.equal(rawAfter, rawBefore,
      'a dry run must migrate in memory only — the on-disk bytes must not change at all');
  });
});

// --- Round-1 review: a zero-must-have payload must not leave the phase permanently drifted -
//
// validateRequirements() allows a payload with zero `must` features (a warning, not an
// error): "judging criterion claimed only by non-must features". When that happens,
// emitKiro() returns an empty Map, so the write loop below never runs — but applySpec()
// unconditionally declares `artifacts: [SPECS_REL]` on the phase regardless. If SPECS_REL is
// never created on disk, an approved phase drifts forever: this is exactly the failure mode
// this file's own header comment describes designing around for openspec/, reintroduced here
// for the triad.

async function zeroMustPayloads() {
  const p = await payloads();
  for (const f of p.requirements.features) f.priority = 'should';
  return p;
}

test('a payload with zero must-have features still creates .hackathon/specs', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { artifacts } = await applySpec(root, { ...(await zeroMustPayloads()), exec: okExec });

    assert.deepEqual(artifacts.filter((a) => a.startsWith('.hackathon/specs')), [],
      'no triad files were written — there are no must-have features to write them for');

    const dirs = await readdir(path.join(root, '.hackathon/specs'));
    assert.deepEqual(dirs, [], 'the directory exists — empty, but it exists');

    const after = await readState(root);
    assert.equal(after.phases.spec.status, 'awaiting_approval');
    assert.deepEqual(after.phases.spec.artifacts, ['.hackathon/specs']);
  });
});

test('full chain: a zero-must apply, once approved, does not report drift on :next', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await applySpec(root, { ...(await zeroMustPayloads()), exec: okExec });

    const state = await readState(root);
    state.phases.spec.status = 'approved';
    await writeState(root, state);

    const result = await resolveNext(root);
    assert.notEqual(result.outcome, 'drift',
      `expected no drift, got: ${JSON.stringify(result)}`);
  });
});

// --- Round-1 review: the triad must be backed up before being overwritten ------------------
//
// tasks.md is a checklist M4's build agent ticks off as it works through a feature — the
// opposite of a file nobody touches. A bare writeFile() with no backup silently destroys any
// checked-off progress on a rerun. Prove the actual scenario: check boxes, rerun, confirm a
// backup exists that still has them checked.

test('a rerun backs up an edited tasks.md before overwriting it', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const p = await payloads();
    await applySpec(root, { ...p, exec: okExec });

    const tasksPath = path.join(root, '.hackathon/specs/0001-shared-care-record/tasks.md');
    const original = await readFile(tasksPath, 'utf8');
    const checked = original.replaceAll('- [ ]', '- [x]');
    assert.notEqual(checked, original, 'the fixture must actually contain checkboxes to flip');
    await writeFile(tasksPath, checked, 'utf8');

    const { backedUp } = await applySpec(root, { ...p, exec: okExec });
    assert.ok(backedUp.some((b) => b.endsWith('0001-shared-care-record/tasks.md')),
      'the edited tasks.md must be reported as backed up');

    const backups = await readdir(path.join(root, '.hackathon/backups'));
    assert.equal(backups.length, 1);
    const saved = await readFile(
      path.join(root, '.hackathon/backups', backups[0],
        '.hackathon/specs/0001-shared-care-record/tasks.md'),
      'utf8',
    );
    assert.equal(saved, checked, 'the backup must hold the checked-off state, not the fresh one');

    const after = await readFile(tasksPath, 'utf8');
    assert.equal(after, original, 'the rerun still regenerates the file from the requirements');
  });
});

// --- Round-1 review: warnings from validateRequirements must reach the caller --------------

test('applySpec surfaces validateRequirements warnings for the CLI to print', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    // applySpec() never passes `recon` to validateRequirements() (it isn't part of its own
    // interface), so every call reliably carries this warning — the fact worth proving here
    // is that applySpec() forwards `warnings` at all, not any specific warning's content.
    const { warnings } = await applySpec(root, { ...(await payloads()), exec: okExec });
    assert.ok(Array.isArray(warnings));
    assert.ok(warnings.some((w) => /recon/i.test(w)),
      'validateRequirements warns when no recon was supplied — applySpec must forward it, not swallow it');
  });
});

// --- Stage 2 review: the backup stamp must be injectable, and actually used ---------------
//
// applySpec() used to mint its own timestamp() with no injection point, so nothing tested
// that its "one coherent, co-timestamped backup set" comment was true — swapping in a
// per-file timestamp() left the whole suite green. Inject a value timestamp() could never
// produce and check on disk that every triad file landed under exactly it.

test('applySpec backs every triad file up under the one injected stamp', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const p = await payloads();
    await applySpec(root, { ...p, exec: okExec });

    const fixedStamp = 'spec-shared-stamp-check';
    const { backedUp, backupStamp } = await applySpec(root, { ...p, exec: okExec, stamp: fixedStamp });

    assert.equal(backupStamp, fixedStamp, 'the stamp actually used must be the one passed in');
    assert.equal(backedUp.length, 6, 'both features\' three triad files were already on disk');

    const backups = await readdir(path.join(root, '.hackathon/backups'));
    assert.deepEqual(backups, [fixedStamp],
      'one apply run must produce exactly one backup directory, and it must be the injected stamp');
    for (const rel of backedUp) {
      assert.ok(await readFile(path.join(root, '.hackathon/backups', fixedStamp, rel), 'utf8'),
        `${rel} did not land under the injected stamp`);
    }
  });
});

// --- Stage 2 review: reprioritising must not orphan a feature's folder --------------------
//
// emitKiro() numbers folders by position in the must-have list, so demoting the first
// must-have used to renumber every later feature's folder. That stranded a build agent's
// ticked-off tasks.md under a name nothing reads again, and reported the renumbered feature
// — still a must-have — as "no longer a must-have feature". Folders are matched by slug now.

test('demoting a must-have reuses the later features\' folders instead of renumbering them', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { requirements, architecture } = await payloads();
    await applySpec(root, { requirements, architecture, exec: okExec });

    const kept = path.join(root, '.hackathon/specs/0002-medication-safety');
    const tasksPath = path.join(kept, 'tasks.md');
    const original = await readFile(tasksPath, 'utf8');
    const checked = original.replaceAll('- [ ]', '- [x]');
    assert.notEqual(checked, original, 'the fixture must actually contain checkboxes to flip');
    await writeFile(tasksPath, checked, 'utf8');
    // A build agent's own working note, in the same folder. Nothing regenerates this, so it
    // is the cleanest proof the folder itself survived rather than being abandoned.
    await writeFile(path.join(kept, 'notes.md'), 'build agent scratch\n', 'utf8');

    // Demote the FIRST must-have. medication-safety is unchanged and still a must.
    const demoted = JSON.parse(JSON.stringify(requirements));
    demoted.features[0].priority = 'should';

    const { skipped, backedUp, artifacts } =
      await applySpec(root, { requirements: demoted, architecture, exec: okExec });

    const dirs = (await readdir(path.join(root, '.hackathon/specs'))).sort();
    assert.deepEqual(dirs, ['0001-shared-care-record', '0002-medication-safety'],
      'the still-must-have feature keeps its folder — no 0001-medication-safety duplicate');

    assert.ok(await readFile(path.join(kept, 'notes.md'), 'utf8'),
      'the reused folder\'s other contents must survive');
    assert.ok(artifacts.includes('.hackathon/specs/0002-medication-safety/tasks.md'),
      'the reused folder is what gets written, so it is what gets declared');
    assert.ok(backedUp.includes('.hackathon/specs/0002-medication-safety/tasks.md'),
      'the ticked tasks.md must be backed up before the rerun regenerates it');
    const backups = (await readdir(path.join(root, '.hackathon/backups'))).sort();
    const saved = await readFile(
      path.join(root, '.hackathon/backups', backups.at(-1),
        '.hackathon/specs/0002-medication-safety/tasks.md'), 'utf8');
    assert.equal(saved, checked, 'the ticked-off state must be recoverable, not lost');

    assert.ok(!skipped.some((s) => s.includes('medication-safety')),
      'a feature that never left the must-have set must never be reported as skipped');
    assert.ok(skipped.some((s) => s.includes('0001-shared-care-record')
      && s.includes('no longer a must-have feature')),
      'the genuinely demoted feature is the only one reported');
  });
});

// --- Stage 2 review: a dry run must say what it would overwrite ---------------------------

test('--dry-run reports the triad files that already exist, and only those', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const p = await payloads();

    const fresh = await applySpec(root, { ...p, exec: okExec, dryRun: true });
    assert.deepEqual(fresh.wouldOverwrite, [],
      'nothing is on disk yet, so a preview must not claim it would overwrite anything');

    await applySpec(root, { ...p, exec: okExec });
    const { wouldOverwrite } = await applySpec(root, { ...p, exec: okExec, dryRun: true });
    assert.ok(wouldOverwrite.includes('.hackathon/specs/0001-shared-care-record/tasks.md'),
      'a tasks.md a build agent may have ticked off must be named before it is regenerated');
    assert.ok(wouldOverwrite.includes('.hackathon/specs/0002-medication-safety/design.md'));
  });
});

// --- Stage 2 review: a readdir failure that is not ENOENT must not be swallowed -----------

test('a specs path that is not a directory surfaces its error rather than being ignored', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await mkdir(path.join(root, '.hackathon'), { recursive: true });
    await writeFile(path.join(root, '.hackathon/specs'), 'not a directory\n', 'utf8');
    const p = await payloads();
    let called = false;
    const spyExec = async () => { called = true; return { code: 0, stdout: '', stderr: '' }; };
    await assert.rejects(
      () => applySpec(root, { ...p, exec: spyExec }),
      // ENOTDIR from the scandir itself, not EEXIST from a later mkdir: the readdir used to
      // catch(() => []) and swallow every error, so the run carried on past a specs path it
      // could not actually read and only tripped further downstream.
      (err) => err.code === 'ENOTDIR',
    );
    assert.equal(called, false, 'it must fail before driving OpenSpec, not after');
  });
});
