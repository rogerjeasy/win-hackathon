import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applySubmission } from '../../scripts/lib/submission-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

const SEEDED_DELIVERABLES = [
  { id: 'text-description', status: 'not_started' },
  { id: 'demo-video', status: 'not_started' },
  { id: 'architecture-diagram', status: 'not_started' },
  { id: 'vercel-project-link', status: 'not_started' },
  { id: 'vercel-team-id', status: 'not_started' },
  { id: 'db-proof-screenshot', status: 'not_started' },
];

async function reviewedState({ deliverables = SEEDED_DELIVERABLES } = {}) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1', review: { clean: true, ref: '.hackathon/review.json' } };
  s.deliverables = { submission_requirements: deliverables, bonus_content: [{ id: 'bonus-1', status: 'not_started', kind: 'blog', platform: null, angle: null, url: null }] };
  return s;
}

test('applySubmission refuses when the review is not clean', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'x', selected_idea: 'i1', review: { clean: false, ref: '.hackathon/review.json' } };
    await writeState(root, s);
    await assert.rejects(
      async () => applySubmission(root, await fx('h0-submission.json')),
      /cannot submit -- review is not clean/,
    );
  });
});

test('applySubmission writes all five surfaces', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await reviewedState());
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    const result = await applySubmission(root, submission, { recon });
    assert.deepEqual(result.artifacts.sort(), [
      '.hackathon/screenshots.md',
      '.hackathon/submission.json',
      '.hackathon/submission.md',
      '.hackathon/video-script.md',
      'README.md',
      'docs/DEMO_RUNBOOK.md',
    ].sort());
    for (const rel of result.artifacts) {
      await readFile(path.join(root, rel), 'utf8'); // throws if not written
    }
  });
});

test('applySubmission marks done tracker items in state.deliverables, leaving others untouched', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await reviewedState());
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    await applySubmission(root, submission, { recon });
    const state = await readState(root);
    const byId = Object.fromEntries(state.deliverables.submission_requirements.map((d) => [d.id, d.status]));
    assert.equal(byId['text-description'], 'done');
    assert.equal(byId['demo-video'], 'not_started', 'the fixture leaves demo-video not_started -- it must stay that way');
    assert.equal(state.deliverables.bonus_content[0].status, 'done');
    assert.equal(state.deliverables.bonus_content[0].url, 'https://dev.to/x/rls-on-aurora');
  });
});

test('applySubmission stays in_progress with a resume_note while a hard requirement is outstanding', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await reviewedState());
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    const result = await applySubmission(root, submission, { recon });
    assert.equal(result.requirementsComplete, false);
    const state = await readState(root);
    assert.equal(state.phases.submit.status, 'in_progress');
    assert.match(state.phases.submit.resume_note, /demo-video/);
    assert.match(state.phases.submit.resume_note, /db-proof-screenshot/);
    assert.equal(state.project.submission.requirements_complete, false);
  });
});

test('applySubmission reaches awaiting_approval once every hard requirement is done or skipped', async () => {
  await withTmpDir(async (root) => {
    const deliverables = SEEDED_DELIVERABLES.map((d) => (
      ['demo-video', 'db-proof-screenshot'].includes(d.id) ? { ...d, status: 'skipped' } : d
    ));
    await writeState(root, await reviewedState({ deliverables }));
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    const result = await applySubmission(root, submission, { recon });
    assert.equal(result.requirementsComplete, true);
    const state = await readState(root);
    assert.equal(state.phases.submit.status, 'awaiting_approval');
    assert.equal(state.project.submission.requirements_complete, true);
  });
});

test('applySubmission dry run writes nothing and reports wouldOverwrite', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await reviewedState());
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    const result = await applySubmission(root, submission, { recon, dryRun: true });
    assert.deepEqual(result.backedUp, []);
    const files = await readdir(root).catch(() => []);
    assert.ok(!files.includes('README.md'), 'dry run must not write README.md');
  });
});

test('applySubmission backs up an existing hand-edited README.md before overwriting', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await withTmpDir(async (root) => {
    await writeState(root, await reviewedState());
    await writeFile(path.join(root, 'README.md'), '# Hand-authored -- do not lose me\n', 'utf8');
    const submission = await fx('h0-submission.json');
    const recon = await fx('h0-recon.json');
    const result = await applySubmission(root, submission, { recon, stamp: 'a-stamp' });
    assert.ok(result.backedUp.includes('README.md'));
    const backedUpContent = await readFile(path.join(root, '.hackathon', 'backups', 'a-stamp', 'README.md'), 'utf8');
    assert.match(backedUpContent, /Hand-authored/);
  });
});

test('applySubmission refuses an invalid payload without touching state', async () => {
  await withTmpDir(async (root) => {
    const before = await reviewedState();
    await writeState(root, before);
    await assert.rejects(() => applySubmission(root, { readme: {} }), /refusing to apply/);
    const after = await readState(root);
    assert.equal(after.phases.submit.status, 'not_started');
  });
});
