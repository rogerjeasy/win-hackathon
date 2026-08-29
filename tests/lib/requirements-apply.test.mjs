import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyRequirements } from '../../scripts/lib/requirements-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { statePath, backupDir } from '../../scripts/lib/paths.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const exists = async (p) => !!(await readFile(p, 'utf8').catch(() => null));

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

async function seeded(root) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(root, s);
}

test('it writes the payload, the markdown and one feature file per feature', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const r = await fx('h0-requirements.json');
    const { artifacts } = await applyRequirements(root, r, {
      recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json'),
    });

    assert.ok(artifacts.includes('.hackathon/requirements.json'));
    assert.ok(artifacts.includes('.hackathon/requirements.md'));
    for (const f of r.features) {
      assert.ok(artifacts.includes(`features/${f.slug}.feature`), `no feature file for ${f.slug}`);
      const body = await readFile(path.join(root, 'features', `${f.slug}.feature`), 'utf8');
      assert.match(body, /^Feature: /);
    }

    const after = await readState(root);
    assert.equal(after.phases.requirements.status, 'awaiting_approval');
    assert.equal(after.project.requirements_ref, '.hackathon/requirements.json');
  });
});

test('the declared artifacts exclude the feature files', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await applyRequirements(root, await fx('h0-requirements.json'), {
      recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json'),
    });
    const after = await readState(root);
    // The Gherkin set varies with the feature list, so listing it would make the drift
    // check fire on a state that is correct.
    assert.deepEqual(after.phases.requirements.artifacts,
      ['.hackathon/requirements.json', '.hackathon/requirements.md']);
  });
});

test('a stale feature file from a previous run is reported, not silently left', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await mkdir(path.join(root, 'features'), { recursive: true });
    await writeFile(path.join(root, 'features', 'removed-feature.feature'), 'Feature: old\n', 'utf8');

    const { skipped } = await applyRequirements(root, await fx('h0-requirements.json'), {
      recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json'),
    });
    assert.ok(skipped.some((s) => s.includes('removed-feature')),
      'an orphaned feature file must be surfaced — deleting it silently is worse');
    const still = await readFile(path.join(root, 'features', 'removed-feature.feature'), 'utf8');
    assert.ok(still.includes('old'), 'and it is left on disk for the user to decide about');
  });
});

test('it refuses an invalid payload', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const bad = await fx('h0-requirements.json');
    bad.features[0].priority = 'critical';
    await assert.rejects(() => applyRequirements(root, bad), /refusing to apply/);
  });
});

test('--dry-run writes nothing', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { artifacts } = await applyRequirements(root, await fx('h0-requirements.json'), {
      recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json'), dryRun: true,
    });
    assert.ok(artifacts.length > 0);
    const missing = await readFile(path.join(root, '.hackathon/requirements.md'), 'utf8')
      .then(() => false).catch(() => true);
    assert.equal(missing, true);
  });
});

// --- a dry run must not migrate state.json to disk --------------------------------------
//
// Same class of defect Fix 7 corrected in applyArchitecture() and I2 corrected in
// applyStack(): applyRequirements() must not call migrateStateFile(root) unconditionally
// before checking dryRun, or an old-schema state.json gets rewritten to the current schema
// even on a dry run, breaking the "filesystem is exactly as it was" guarantee.
function v1StateWithProject() {
  const phases = {};
  for (const p of ['recon', 'brainstorm', 'describe', 'stack', 'architect',
    'requirements', 'spec', 'build', 'ship', 'review', 'submit']) {
    phases[p] = { status: 'not_started' };
  }
  return {
    schema_version: 1,
    plugin_version: '0.1.0',
    hackathon: null,
    project: { name: 'Kintwadi', selected_idea: 'i1' },
    phases,
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

test('--dry-run on an old-schema state.json leaves the file byte-for-byte untouched', async () => {
  await withTmpDir(async (root) => {
    await mkdir(path.dirname(statePath(root)), { recursive: true });
    const rawBefore = JSON.stringify(v1StateWithProject(), null, 2);
    await writeFile(statePath(root), rawBefore, 'utf8');

    const { artifacts } = await applyRequirements(root, await fx('h0-requirements.json'), {
      recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json'), dryRun: true,
    });
    assert.ok(artifacts.length > 0, 'the preview must still be computable from the migrated shape');

    const rawAfter = await readFile(statePath(root), 'utf8');
    assert.equal(rawAfter, rawBefore,
      'a dry run must migrate in memory only — the on-disk bytes must not change at all');
  });
});

// --- Critical: a rerun must back up requirements.json/requirements.md before overwriting -
//
// applyRequirements() used to hardcode backedUp: [] on both return paths and import no
// backupFile at all: a hand edit to requirements.md, or requirements.json, was silently
// destroyed on the next apply with no backup ever created. Same defect class as the Stage 1
// C1/C2/I1 findings. Proven two ways below: a hand edit to requirements.md is recoverable
// from the backup, and a second apply run does not clobber the first backup set.

test('a hand-edited requirements.md is backed up before being overwritten, and is recoverable', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const r = await fx('h0-requirements.json');
    const recon = await fx('h0-recon.json');
    const architecture = await fx('h0-architecture.json');
    await applyRequirements(root, r, { recon, architecture });

    const mdPath = path.join(root, '.hackathon', 'requirements.md');
    await writeFile(mdPath, '# Hand-edited\n\nDo not lose me.\n', 'utf8');

    const { backedUp } = await applyRequirements(root, r, { recon, architecture });
    assert.ok(backedUp.includes('.hackathon/requirements.md'),
      'the overwritten requirements.md must be reported as backed up');
    assert.ok(backedUp.includes('.hackathon/requirements.json'),
      'requirements.json gets the same treatment stack.json does in stack-apply.mjs');

    const stamps = await readdir(path.join(root, '.hackathon', 'backups'));
    assert.equal(stamps.length, 1, 'exactly one backup set from this apply run');
    const saved = await readFile(
      path.join(backupDir(root, stamps[0]), '.hackathon', 'requirements.md'), 'utf8',
    );
    assert.match(saved, /Do not lose me\./, 'the hand edit must be recoverable from the backup');
  });
});

test('feature files are not backed up — regenerating them on every run is the contract', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const r = await fx('h0-requirements.json');
    const recon = await fx('h0-recon.json');
    const architecture = await fx('h0-architecture.json');
    await applyRequirements(root, r, { recon, architecture });
    const { backedUp } = await applyRequirements(root, r, { recon, architecture });
    assert.ok(!backedUp.some((b) => b.endsWith('.feature')),
      'a .feature file must never appear in backedUp — the skill tells the user never to hand-edit one');
  });
});

// --- Important: an undescribed project must be refused before anything is written -------
//
// Both sibling apply functions call requireDescribedProject(state, root) right after
// loading state; applyRequirements() did not, so on a project that never ran :describe it
// wrote all four artifacts to disk and only then threw from writeState()'s own schema
// validation — the exact half-written state this check exists to prevent.

test('it refuses when project is not set, and no artifact exists', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, createDefaultState({ pluginVersion: '0.1.0' })); // project: null
    const r = await fx('h0-requirements.json');
    const recon = await fx('h0-recon.json');
    const architecture = await fx('h0-architecture.json');
    await assert.rejects(
      () => applyRequirements(root, r, { recon, architecture }),
      /win-hackathon:describe/,
    );

    assert.equal(await exists(path.join(root, '.hackathon', 'requirements.json')), false);
    assert.equal(await exists(path.join(root, '.hackathon', 'requirements.md')), false);
    for (const f of r.features) {
      assert.equal(await exists(path.join(root, 'features', `${f.slug}.feature`)), false,
        `${f.slug}.feature must not exist when the project precondition fails`);
    }
    const after = await readState(root);
    assert.equal(after.phases.requirements.status, 'not_started', 'state must not move either');
  });
});
