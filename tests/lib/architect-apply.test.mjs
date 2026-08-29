import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyArchitecture } from '../../scripts/lib/architect-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

async function seeded(root) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(root, s);
}

const exists = async (p) => !!(await readFile(p, 'utf8').catch(() => null));

test('it writes all eight artifacts and parks the phase at the gate', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { artifacts } = await applyArchitecture(root, await fx('h0-architecture.json'),
      { stack: await fx('h0-stack.json') });

    assert.deepEqual(artifacts.sort(), [
      '.hackathon/architecture.json',
      'AGENTS.md',
      'CLAUDE.md',
      'docs/architecture.md',
      'docs/assets/architecture.drawio',
      'docs/assets/architecture.mmd',
      'docs/assets/architecture.svg',
      'docs/data-model.md',
    ].sort());

    for (const a of artifacts) assert.ok(await exists(path.join(root, a)), `${a} was not written`);

    const after = await readState(root);
    assert.equal(after.phases.architect.status, 'awaiting_approval');
    assert.equal(after.project.architecture_ref, '.hackathon/architecture.json');
  });
});

test('the three diagram renderings agree on every component', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const arch = await fx('h0-architecture.json');
    await applyArchitecture(root, arch, { stack: await fx('h0-stack.json') });

    const [mmd, svg, drawio] = await Promise.all([
      readFile(path.join(root, 'docs/assets/architecture.mmd'), 'utf8'),
      readFile(path.join(root, 'docs/assets/architecture.svg'), 'utf8'),
      readFile(path.join(root, 'docs/assets/architecture.drawio'), 'utf8'),
    ]);
    for (const c of arch.components) {
      assert.ok(mmd.includes(c.id), `mermaid is missing ${c.id}`);
      assert.ok(svg.includes(c.label), `svg is missing ${c.label}`);
      assert.ok(drawio.includes(`id="${c.id}"`), `drawio is missing ${c.id}`);
    }
  });
});

test('an existing AGENTS.md is backed up before it is touched', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await writeFile(path.join(root, 'AGENTS.md'), '# Mine\n\nHand-written rule.\n', 'utf8');

    const { backedUp } = await applyArchitecture(root, await fx('h0-architecture.json'),
      { stack: await fx('h0-stack.json') });

    assert.ok(backedUp.some((b) => b.includes('AGENTS.md')), 'no backup was recorded');
    const backups = await readdir(path.join(root, '.hackathon', 'backups'));
    assert.equal(backups.length, 1, 'exactly one timestamped backup directory');
    const saved = await readFile(
      path.join(root, '.hackathon', 'backups', backups[0], 'AGENTS.md'), 'utf8');
    assert.ok(saved.includes('Hand-written rule.'));

    const now = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.ok(now.includes('Hand-written rule.'), 'the hand-written part survives in place too');
    assert.ok(now.includes('Security invariants'));
  });
});

// Fix 8 (task-18a): the guarantee is that one timestamp is shared across both files'
// backups, so a single run produces one coherent backup set. Sound by construction (both
// go through the same `stamp` in the write loop) — Ruling F22 explicitly refused to weaken
// the backup promise, so this must not rest on construction alone.
test('AGENTS.md and CLAUDE.md, both pre-existing, are backed up under the same timestamp', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await writeFile(path.join(root, 'AGENTS.md'), '# Mine\n\nAgents rule.\n', 'utf8');
    await writeFile(path.join(root, 'CLAUDE.md'), '# Also mine\n\nClaude rule.\n', 'utf8');

    // timestamp() has one-second resolution, so two calls microseconds apart -- e.g. one
    // per file instead of one shared value -- can still land in the same wall-clock
    // second and produce indistinguishable directory names. Counting backup directories
    // can't tell a shared stamp from a coincidence, so inject a stamp neither call could
    // produce on its own and check on disk that BOTH files actually landed under it.
    const fixedStamp = 'fix8-shared-stamp-check';
    const { backedUp, backupStamp } = await applyArchitecture(root, await fx('h0-architecture.json'),
      { stack: await fx('h0-stack.json'), stamp: fixedStamp });

    assert.equal(backupStamp, fixedStamp, 'the stamp actually used must be the one passed in');
    assert.ok(backedUp.includes('AGENTS.md'), 'AGENTS.md was not recorded as backed up');
    assert.ok(backedUp.includes('CLAUDE.md'), 'CLAUDE.md was not recorded as backed up');

    const backups = await readdir(path.join(root, '.hackathon', 'backups'));
    assert.deepEqual(backups, [fixedStamp],
      'one apply run must produce exactly one backup directory, and it must be the injected stamp');

    const [agentsSaved, claudeSaved] = await Promise.all([
      readFile(path.join(root, '.hackathon', 'backups', fixedStamp, 'AGENTS.md'), 'utf8'),
      readFile(path.join(root, '.hackathon', 'backups', fixedStamp, 'CLAUDE.md'), 'utf8'),
    ]);
    assert.ok(agentsSaved.includes('Agents rule.'), 'AGENTS.md backup has the wrong content');
    assert.ok(claudeSaved.includes('Claude rule.'), 'CLAUDE.md backup has the wrong content');
  });
});

test('--dry-run writes nothing at all', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const { artifacts } = await applyArchitecture(root, await fx('h0-architecture.json'),
      { stack: await fx('h0-stack.json'), dryRun: true });

    assert.ok(artifacts.length > 0, 'it still reports what it would write');
    for (const a of artifacts) {
      assert.equal(await exists(path.join(root, a)), false, `${a} was written during a dry run`);
    }
    const after = await readState(root);
    assert.equal(after.phases.architect.status, 'not_started', 'state must not move on a dry run');
  });
});

// --- Fix 7 (task-18a): a dry run must not migrate state.json to disk --------------------
//
// applyArchitecture() used to call migrateStateFile(root) unconditionally, before checking
// dryRun — so an old-schema state.json got rewritten to the current schema even on a dry
// run, breaking the "filesystem is exactly as it was" guarantee C1/C2 established. This is
// that same class of defect (dry-run that writes), pulled forward because Tasks 20 and 23
// each add their own dryRun path.
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

    const { artifacts } = await applyArchitecture(root, await fx('h0-architecture.json'),
      { stack: await fx('h0-stack.json'), dryRun: true });
    assert.ok(artifacts.length > 0, 'the preview must still be computable from the migrated shape');

    const rawAfter = await readFile(statePath(root), 'utf8');
    assert.equal(rawAfter, rawBefore,
      'a dry run must migrate in memory only — the on-disk bytes must not change at all');
  });
});

test('it refuses an invalid payload rather than writing part of it', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const bad = await fx('h0-architecture.json');
    bad.edges.push({ from: 'web', to: 'ghost' });
    await assert.rejects(() => applyArchitecture(root, bad), /refusing to apply/);
    assert.equal(await exists(path.join(root, 'docs/architecture.md')), false);
  });
});

test('a rerun is idempotent — same payload, same bytes, one backup set', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const arch = await fx('h0-architecture.json');
    const stack = await fx('h0-stack.json');
    await applyArchitecture(root, arch, { stack });
    const first = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    await applyArchitecture(root, arch, { stack });
    const second = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.equal(second, first, 'a rerun must not duplicate the managed block');
  });
});

// --- C2: an undescribed project must be refused before anything is written --------------

test('applyArchitecture refuses when project is null, and no artifact exists', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, createDefaultState({ pluginVersion: '0.1.0' })); // project: null
    const arch = await fx('h0-architecture.json');
    const stack = await fx('h0-stack.json');
    await assert.rejects(() => applyArchitecture(root, arch, { stack }),
      /win-hackathon:describe/);

    for (const a of [
      '.hackathon/architecture.json', 'docs/architecture.md', 'docs/data-model.md',
      'docs/assets/architecture.mmd', 'docs/assets/architecture.svg',
      'docs/assets/architecture.drawio', 'AGENTS.md', 'CLAUDE.md',
    ]) {
      assert.equal(await exists(path.join(root, a)), false, `${a} was written despite the refusal`);
    }
    const after = await readState(root);
    assert.equal(after.phases.architect.status, 'not_started', 'state must not move either');
  });
});

// --- I1: a pre-existing docs/ artifact is backed up before it is overwritten -------------

test('a hand-edited docs/architecture.md is recoverable from the backup directory after a re-run', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const arch = await fx('h0-architecture.json');
    const stack = await fx('h0-stack.json');
    await applyArchitecture(root, arch, { stack });

    await mkdir(path.join(root, 'docs'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'architecture.md'), '# Hand-edited\n\nMine.\n', 'utf8');

    const { backedUp } = await applyArchitecture(root, arch, { stack });
    assert.ok(backedUp.includes('docs/architecture.md'), 'no backup was recorded');

    // timestamp() has one-second resolution, so a fast second run can land in the same
    // backup directory as the first -- assert on the newest one rather than the count.
    const backups = (await readdir(path.join(root, '.hackathon', 'backups'))).sort();
    const latest = backups.at(-1);
    const saved = await readFile(
      path.join(root, '.hackathon', 'backups', latest, 'docs', 'architecture.md'), 'utf8');
    assert.ok(saved.includes('Mine.'), 'the hand-edited content must be recoverable');
  });
});

test('an orphaned marker in AGENTS.md makes applyArchitecture reject, and nothing is written', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    await writeFile(
      path.join(root, 'AGENTS.md'),
      '# Mine\n\n<!-- BEGIN:win-hackathon -->\nstray, unclosed\n',
      'utf8',
    );

    const arch = await fx('h0-architecture.json');
    const stack = await fx('h0-stack.json');
    await assert.rejects(
      () => applyArchitecture(root, arch, { stack }),
      /refusing to write/,
    );

    // Nothing at all may have been written, including artifacts that come before
    // AGENTS.md in the write order.
    for (const a of [
      '.hackathon/architecture.json',
      'docs/architecture.md',
      'docs/data-model.md',
      'docs/assets/architecture.mmd',
      'docs/assets/architecture.svg',
      'docs/assets/architecture.drawio',
      'CLAUDE.md',
    ]) {
      assert.equal(await exists(path.join(root, a)), false, `${a} was written despite the throw`);
    }
    // AGENTS.md itself must be untouched — still the mangled original, no backup taken.
    const now = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.match(now, /stray, unclosed/);
    await assert.rejects(() => readdir(path.join(root, '.hackathon', 'backups')), /ENOENT/);

    const after = await readState(root);
    assert.equal(after.phases.architect.status, 'not_started', 'state must not move either');
  });
});
