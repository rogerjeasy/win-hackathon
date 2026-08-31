import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { planInit } from '../../scripts/lib/init-plan.mjs';
import { applyInit } from '../../scripts/lib/init-apply.mjs';
import { readState } from '../../scripts/lib/state.mjs';

const OPTS = { pluginVersion: '0.1.0', stamp: '2026-08-21T00-00-00Z' };

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

test('greenfield apply creates a valid state file', async () => {
  await withTmpDir(async (dir) => {
    const plan = await planInit(dir);
    await applyInit(dir, plan, { ...OPTS, consented: new Set() });
    const s = await readState(dir);
    assert.equal(s.plugin_version, '0.1.0');
    assert.equal(s.phases.recon.status, 'not_started');
  });
});

test('an unconsented action is skipped and the file is left untouched', async () => {
  await withTmpDir(async (dir) => {
    const original = '# my precious rules\n';
    await writeFile(path.join(dir, 'CLAUDE.md'), original);

    const plan = await planInit(dir);
    const { skipped } = await applyInit(dir, plan, { ...OPTS, consented: new Set() });

    assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), original,
      'file must be byte-identical when consent was not given');
    assert.ok(skipped.some((a) => a.path === 'CLAUDE.md'));
  });
});

test('a consented action is applied and preserves surrounding content', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# my precious rules\n');
    const plan = await planInit(dir);
    await applyInit(dir, plan, { ...OPTS, consented: new Set(['CLAUDE.md']) });

    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(after.includes('# my precious rules'), 'original content survives');
    assert.ok(after.includes('BEGIN:win-hackathon'), 'our block was added');
  });
});

test('a consented overwrite backs the file up first', async () => {
  await withTmpDir(async (dir) => {
    const original = '# my precious rules\n';
    await writeFile(path.join(dir, 'CLAUDE.md'), original);
    const plan = await planInit(dir);
    const { backups } = await applyInit(dir, plan, { ...OPTS, consented: new Set(['CLAUDE.md']) });

    assert.equal(backups.length, 1);
    assert.equal(await readFile(backups[0], 'utf8'), original,
      'backup must hold the pre-write bytes');
    assert.ok(backups[0].includes(path.join('.hackathon', 'backups', OPTS.stamp)));
  });
});

test('applying twice is idempotent and does not duplicate the block', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# rules\n');
    const consented = new Set(['CLAUDE.md']);
    await applyInit(dir, await planInit(dir), { ...OPTS, consented });
    await applyInit(dir, await planInit(dir), { ...OPTS, stamp: '2026-08-21T00-00-01Z', consented });

    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.equal(after.match(/BEGIN:win-hackathon/g).length, 1);
  });
});

test('apply never overwrites an existing state file', async () => {
  await withTmpDir(async (dir) => {
    await applyInit(dir, await planInit(dir), { ...OPTS, consented: new Set() });
    await import('node:fs/promises').then(({ writeFile: w }) =>
      w(path.join(dir, '.hackathon', 'marker.txt'), 'x'));

    const second = await planInit(dir);
    await applyInit(dir, second, { ...OPTS, consented: new Set() });

    assert.ok(await exists(path.join(dir, '.hackathon', 'marker.txt')),
      'a second init must not wipe the workshop directory');
  });
});

test('git-init is skipped without consent', async () => {
  await withTmpDir(async (dir) => {
    const plan = await planInit(dir);
    const { skipped } = await applyInit(dir, plan, { ...OPTS, consented: new Set() });
    assert.equal(await exists(path.join(dir, '.git')), false);
    assert.ok(skipped.some((a) => a.kind === 'git-init'));
  });
});

test('git-init runs when consented', async () => {
  await withTmpDir(async (dir) => {
    const plan = await planInit(dir);
    await applyInit(dir, plan, { ...OPTS, consented: new Set(['.']) });
    assert.equal(await exists(path.join(dir, '.git')), true);
  });
});

test('two applyInit runs in the same wall-clock second do not destroy each other\'s backup', async () => {
  await withTmpDir(async (dir) => {
    // Seed a hand-edited CLAUDE.md so both runs have something to back up.
    await writeFile(path.join(dir, 'CLAUDE.md'), 'First edit -- do not lose me.\n', 'utf8');
    const plan = await planInit(dir);
    const collide = 'same-second';

    const first = await applyInit(dir, plan, {
      ...OPTS, stamp: collide, consented: new Set(['CLAUDE.md']),
    });
    const firstClaude = first.backups.find((p) => p.endsWith(path.join('CLAUDE.md')));
    assert.ok(firstClaude, 'CLAUDE.md should have been backed up on the first run');

    await writeFile(path.join(dir, 'CLAUDE.md'), 'Second edit -- do not lose me either.\n', 'utf8');
    const second = await applyInit(dir, await planInit(dir), {
      ...OPTS, stamp: collide, consented: new Set(['CLAUDE.md']),
    });
    const secondClaude = second.backups.find((p) => p.endsWith(path.join('CLAUDE.md')));
    assert.ok(secondClaude, 'CLAUDE.md should have been backed up on the second run too');

    assert.ok(firstClaude.includes(path.join('.hackathon', 'backups', collide)));
    assert.ok(secondClaude.includes(path.join('.hackathon', 'backups', `${collide}-2`)),
      'the second run must claim a directory of its own, not overwrite the first run\'s');

    assert.equal(await readFile(firstClaude, 'utf8'), 'First edit -- do not lose me.\n',
      'the first run\'s backup was destroyed by the second');
    assert.equal(await readFile(secondClaude, 'utf8'), 'Second edit -- do not lose me either.\n');
  });
});
