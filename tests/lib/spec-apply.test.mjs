import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applySpec } from '../../scripts/lib/spec-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
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
