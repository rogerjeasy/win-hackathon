import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { nextRoundNumber, archiveRound, applyIdeas } from '../../scripts/lib/brainstorm-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

async function goldenIdeas() {
  const raw = await readFile(new URL('../fixtures/h0-ideas.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function seed(dir) {
  await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
}

test('the first round is round 1', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    assert.equal(await nextRoundNumber(dir), 1);
  });
});

test('the round number advances past preserved rounds', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/ideas-round-1.md'), '#', 'utf8');
    await writeFile(path.join(dir, '.hackathon/ideas-round-2.md'), '#', 'utf8');
    assert.equal(await nextRoundNumber(dir), 3);
  });
});

test('archiveRound preserves the current round under a numbered name', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());

    const { round, moved } = await archiveRound(dir);
    assert.equal(round, 1);
    assert.equal(moved.length, 2);
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.md')));
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.json')));
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.md')), false);
  });
});

test('archiveRound is a no-op when there is no current round', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    assert.deepEqual(await archiveRound(dir), { round: null, moved: [] });
  });
});

test('archiveRound never overwrites an existing preserved round', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());
    await archiveRound(dir);
    await applyIdeas(dir, await goldenIdeas());
    const { round } = await archiveRound(dir);
    assert.equal(round, 2);
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.md')));
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-2.md')));
  });
});

test('applyIdeas writes both artifacts and leaves the phase awaiting approval', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const { artifacts } = await applyIdeas(dir, await goldenIdeas());
    assert.deepEqual(artifacts.sort(), ['.hackathon/ideas.json', '.hackathon/ideas.md']);

    const state = await readState(dir);
    assert.equal(state.phases.brainstorm.status, 'awaiting_approval');
    assert.deepEqual(state.phases.brainstorm.artifacts.sort(), artifacts.sort());
    assert.equal(state.phases.brainstorm.rounds, 1);
  });
});

test('applyIdeas increments the round count across rounds', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());
    await archiveRound(dir);
    const second = await goldenIdeas();
    second.round = 2;
    await applyIdeas(dir, second);
    assert.equal((await readState(dir)).phases.brainstorm.rounds, 2);
  });
});

test('applyIdeas refuses an invalid payload and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const bad = await goldenIdeas();
    bad.ideas[0].thesis = '';
    await assert.rejects(() => applyIdeas(dir, bad), /thesis/);
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.md')), false);
    assert.equal((await readState(dir)).phases.brainstorm.status, 'not_started');
  });
});

test('applyIdeas cross-checks against recon.json when it is present', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const recon = JSON.parse(
      await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8'),
    );
    await writeFile(path.join(dir, '.hackathon/recon.json'), JSON.stringify(recon), 'utf8');

    const bad = await goldenIdeas();
    bad.ideas[0].scores[0].criterion_id = 'vibes';
    await assert.rejects(() => applyIdeas(dir, bad), /vibes/);
  });
});

test('applyIdeas rejects loudly when recon.json exists but is corrupt, and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await writeFile(path.join(dir, '.hackathon/recon.json'), '{ not valid json', 'utf8');
    const doc = await goldenIdeas();

    // Must be the loud parse failure, not an incidental TypeError from treating the
    // corrupt recon as if it were merely absent.
    await assert.rejects(
      () => applyIdeas(dir, doc),
      /recon\.json could not be parsed as JSON/,
    );
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.json')), false);
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.md')), false);
  });
});

test('applyIdeas requires state to exist', async () => {
  await withTmpDir(async (dir) => {
    const doc = await goldenIdeas();
    await assert.rejects(() => applyIdeas(dir, doc), /init/i);
  });
});
