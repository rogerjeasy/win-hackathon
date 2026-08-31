import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withTmpDir } from './helpers/tmp.mjs';
import { scaffoldStage4Project } from './helpers/scaffold.mjs';
import { applyReview } from '../scripts/lib/review-apply.mjs';
import { readState } from '../scripts/lib/state.mjs';

const fixture = async (n) => JSON.parse(await readFile(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

test('Stage 1 milestone: a blocking review refuses to advance, a clean re-run does', async () => {
  await withTmpDir(async (root) => {
    await scaffoldStage4Project(root);

    const blocked = await applyReview(root, await fixture('h0-review-blocking.json'));
    assert.equal(blocked.clean, false);
    let state = await readState(root);
    assert.equal(state.phases.review.status, 'in_progress');
    assert.equal(state.project.review.clean, false);

    const clean = await applyReview(root, await fixture('h0-review-clean.json'));
    assert.equal(clean.clean, true);
    state = await readState(root);
    assert.equal(state.phases.review.status, 'awaiting_approval');
    assert.equal(state.project.review.clean, true);
  });
});
