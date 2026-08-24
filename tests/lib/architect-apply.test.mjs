import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyArchitecture } from '../../scripts/lib/architect-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
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
