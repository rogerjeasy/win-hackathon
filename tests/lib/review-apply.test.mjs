import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { mergeFindings, applyReview } from '../../scripts/lib/review-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { withTmpDir } from './../helpers/tmp.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

async function approvedShipState() {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  s.phases.ship = { status: 'approved' };
  return s;
}

test('mergeFindings assigns REV- ids in pass order, code-review first', () => {
  const codeReview = [
    { severity: 'should-fix', title: 'A', summary: '…', file: null, line: null, judge_visible: false },
  ];
  const qualityReviewer = [
    { severity: 'blocking', title: 'B', summary: '…', file: 'x.ts', line: 1, judge_visible: true },
    { severity: 'post-hackathon', title: 'C', summary: '…', file: null, line: null, judge_visible: false },
  ];
  const merged = mergeFindings(codeReview, qualityReviewer);
  assert.equal(merged.schema_version, 1);
  assert.deepEqual(merged.findings.map((f) => f.id), ['REV-1', 'REV-2', 'REV-3']);
  assert.deepEqual(merged.findings.map((f) => f.source), ['code-review', 'quality-reviewer', 'quality-reviewer']);
  assert.equal(merged.findings[0].title, 'A');
  assert.equal(merged.findings[1].title, 'B');
});

test('mergeFindings is deterministic across repeated calls with the same inputs', () => {
  const a = [{ severity: 'should-fix', title: 'X', summary: '…', file: null, line: null, judge_visible: false }];
  const b = [{ severity: 'blocking', title: 'Y', summary: '…', file: null, line: null, judge_visible: true }];
  assert.deepEqual(mergeFindings(a, b), mergeFindings(a, b));
});

test('mergeFindings accepts { findings: [...] } -- quality-reviewer.md\'s own documented report shape', () => {
  const codeReview = [
    { severity: 'should-fix', title: 'A', summary: '…', file: null, line: null, judge_visible: false },
  ];
  const qualityReviewerReport = {
    findings: [
      { severity: 'blocking', title: 'B', summary: '…', file: 'x.ts', line: 1, judge_visible: true },
    ],
  };
  const merged = mergeFindings(codeReview, qualityReviewerReport);
  assert.deepEqual(merged.findings.map((f) => f.id), ['REV-1', 'REV-2']);
  assert.deepEqual(merged.findings.map((f) => f.source), ['code-review', 'quality-reviewer']);
  assert.equal(merged.findings[1].title, 'B');
});

test('mergeFindings throws a clear, named error when an argument is neither an array nor { findings: [...] }', () => {
  const codeReview = [
    { severity: 'should-fix', title: 'A', summary: '…', file: null, line: null, judge_visible: false },
  ];
  assert.throws(
    () => mergeFindings(codeReview, 'not-a-findings-payload'),
    /mergeFindings: qualityReviewerFindings must be an array of findings or an object shaped \{ findings: \[\.\.\.\] \}/,
  );
});

test('applyReview does not gate on :ship status -- no apply-level precondition, matching applyShip not gating on :build', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    await writeState(root, s); // phases.ship stays 'not_started'
    const review = await fixture('h0-review-clean.json');
    const result = await applyReview(root, review);
    assert.equal(result.clean, true);
    const state = await readState(root);
    assert.equal(state.phases.review.status, 'awaiting_approval');
  });
});

test('applyReview on a clean review writes review.json + review.md and reaches awaiting_approval', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await approvedShipState());
    const review = await fixture('h0-review-clean.json');
    const result = await applyReview(root, review);
    assert.deepEqual(result.artifacts, ['.hackathon/review.json', '.hackathon/review.md']);
    assert.equal(result.clean, true);
    assert.deepEqual(result.blocking, []);

    const state = await readState(root);
    assert.deepEqual(state.project.review, { clean: true, ref: '.hackathon/review.json' });
    assert.equal(state.phases.review.status, 'awaiting_approval');
    assert.equal(state.phases.review.resume_note ?? null, null);

    const md = await readFile(path.join(root, '.hackathon', 'review.md'), 'utf8');
    assert.match(md, /Should-fix/);
  });
});

test('applyReview on a blocking review stays in_progress with a resume_note naming the blocking ids', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await approvedShipState());
    const review = await fixture('h0-review-blocking.json');
    const result = await applyReview(root, review);
    assert.equal(result.clean, false);
    assert.deepEqual(result.blocking, ['REV-1']);

    const state = await readState(root);
    assert.deepEqual(state.project.review, { clean: false, ref: '.hackathon/review.json' });
    assert.equal(state.phases.review.status, 'in_progress');
    assert.match(state.phases.review.resume_note, /REV-1/);
  });
});

test('applyReview dry run writes nothing and reports wouldOverwrite', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await approvedShipState());
    const result = await applyReview(root, await fixture('h0-review-clean.json'), { dryRun: true });
    assert.deepEqual(result.wouldOverwrite, []);
    assert.deepEqual(result.backedUp, []);
    const files = await readdir(path.join(root, '.hackathon')).catch(() => []);
    assert.ok(!files.includes('review.json'), 'dry run must not write review.json');
  });
});

test('applyReview backs up an existing review.json/review.md before overwriting', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, await approvedShipState());
    await applyReview(root, await fixture('h0-review-clean.json'), { stamp: 'first' });
    const result = await applyReview(root, await fixture('h0-review-blocking.json'), { stamp: 'second' });
    assert.deepEqual(result.backedUp.sort(), ['.hackathon/review.json', '.hackathon/review.md']);
  });
});

test('applyReview refuses an invalid payload without touching state', async () => {
  await withTmpDir(async (root) => {
    const before = await approvedShipState();
    await writeState(root, before);
    await assert.rejects(() => applyReview(root, { findings: 'nope' }), /refusing to apply/);
    const after = await readState(root);
    assert.equal(after.phases.review.status, 'not_started');
  });
});
