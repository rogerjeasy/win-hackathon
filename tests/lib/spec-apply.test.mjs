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
