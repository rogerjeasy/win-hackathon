import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';
import { scaffoldStage5Project } from './helpers/scaffold.mjs';
import { applySubmission } from '../scripts/lib/submission-apply.mjs';
import { readState } from '../scripts/lib/state.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

test('Stage 2 milestone: an incomplete submission refuses the gate; completing every hard requirement passes it', async () => {
  await withTmpDir(async (root) => {
    await scaffoldStage5Project(root);
    const submission = await fx('h0-submission.json'); // leaves demo-video/db-proof-screenshot not_started
    const recon = await fx('h0-recon.json');

    const first = await applySubmission(root, submission, { recon });
    assert.equal(first.requirementsComplete, false);
    let state = await readState(root);
    assert.equal(state.phases.submit.status, 'in_progress');

    submission.devpost_form.requirements_tracker = submission.devpost_form.requirements_tracker.map(
      (r) => ({ ...r, status: r.status === 'not_started' ? 'skipped' : r.status }),
    );
    const second = await applySubmission(root, submission, { recon });
    assert.equal(second.requirementsComplete, true);
    state = await readState(root);
    assert.equal(state.phases.submit.status, 'awaiting_approval');
    assert.equal(state.project.submission.requirements_complete, true);

    // All five surfaces exist and are non-empty.
    for (const rel of [
      'README.md', 'docs/DEMO_RUNBOOK.md', '.hackathon/submission.md',
      '.hackathon/video-script.md', '.hackathon/screenshots.md',
    ]) {
      const content = await readFile(path.join(root, rel), 'utf8');
      assert.ok(content.length > 0, `${rel} is empty`);
    }
  });
});
