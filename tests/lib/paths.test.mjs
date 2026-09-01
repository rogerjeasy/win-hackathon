import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  stackPath, architecturePath, requirementsPath, specsDir,
  docsPath, assetsPath, featurePath, HACKATHON_DIR, deployPath, reviewPath, submissionPath,
} from '../../scripts/lib/paths.mjs';

const ROOT = '/tmp/proj';

test('workshop payloads live under .hackathon/', () => {
  assert.equal(stackPath(ROOT), path.join(ROOT, HACKATHON_DIR, 'stack.json'));
  assert.equal(architecturePath(ROOT), path.join(ROOT, HACKATHON_DIR, 'architecture.json'));
  assert.equal(requirementsPath(ROOT), path.join(ROOT, HACKATHON_DIR, 'requirements.json'));
  assert.equal(specsDir(ROOT), path.join(ROOT, HACKATHON_DIR, 'specs'));
});

test('showroom artifacts live under docs/, not .hackathon/', () => {
  assert.equal(docsPath(ROOT, 'architecture.md'), path.join(ROOT, 'docs', 'architecture.md'));
  assert.equal(assetsPath(ROOT, 'architecture.svg'),
    path.join(ROOT, 'docs', 'assets', 'architecture.svg'));
  assert.ok(!docsPath(ROOT, 'data-model.md').includes(HACKATHON_DIR),
    'data-model.md is judge-facing and must not land in the workshop');
});

test('feature files are named from the slug, at the repo root', () => {
  assert.equal(featurePath(ROOT, 'shared-care-record'),
    path.join(ROOT, 'features', 'shared-care-record.feature'));
});

test('deployPath is .hackathon/deploy.json', () => {
  assert.equal(deployPath('/proj'), path.join('/proj', '.hackathon', 'deploy.json'));
});

test('reviewPath joins the hackathon dir and REVIEW_FILE', () => {
  assert.equal(reviewPath('/proj'), path.join('/proj', '.hackathon', 'review.json'));
});

test('submissionPath joins the hackathon dir and SUBMISSION_FILE', () => {
  assert.equal(submissionPath('/proj'), path.join('/proj', '.hackathon', 'submission.json'));
});
