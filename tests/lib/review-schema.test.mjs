import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateReview, isClean, blockingFindings, REVIEW_SCHEMA_VERSION,
} from '../../scripts/lib/review-schema.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('validateReview accepts the clean and the blocking fixtures', async () => {
  for (const name of ['h0-review-clean.json', 'h0-review-blocking.json']) {
    const { valid, errors } = validateReview(await fixture(name));
    assert.deepEqual(errors, [], `${name}: ${errors.join('; ')}`);
    assert.equal(valid, true);
  }
});

test('validateReview rejects an unknown severity', async () => {
  const review = await fixture('h0-review-clean.json');
  review.findings[0].severity = 'urgent';
  const { valid, errors } = validateReview(review);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /severity "urgent" is not one of/.test(e)));
});

test('validateReview rejects an unknown source', async () => {
  const review = await fixture('h0-review-clean.json');
  review.findings[0].source = 'linter';
  const { valid, errors } = validateReview(review);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /source "linter" is not one of/.test(e)));
});

test('validateReview rejects a duplicate id', async () => {
  const review = await fixture('h0-review-blocking.json');
  review.findings[1].id = review.findings[0].id;
  const { valid, errors } = validateReview(review);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /is not unique/.test(e)));
});

test('validateReview requires judge_visible as an explicit boolean', async () => {
  const review = await fixture('h0-review-clean.json');
  delete review.findings[0].judge_visible;
  const { valid, errors } = validateReview(review);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /judge_visible must be a boolean/.test(e)));
});

test('validateReview accepts a null file/line and rejects a non-positive line', async () => {
  const review = await fixture('h0-review-clean.json');
  review.findings[0].file = null;
  review.findings[0].line = null;
  assert.equal(validateReview(review).valid, true);
  review.findings[0].line = 0;
  assert.equal(validateReview(review).valid, false);
});

test('validateReview never accepts a verdict field as meaningful -- it is not part of the shape', async () => {
  const review = await fixture('h0-review-clean.json');
  review.verdict = 'clean';
  // Extra fields are not rejected (forward-compat), but the field is simply ignored --
  // isClean() below proves nothing reads it.
  assert.equal(validateReview(review).valid, true);
});

test('isClean is true only when no finding is blocking', async () => {
  assert.equal(isClean(await fixture('h0-review-clean.json')), true);
  assert.equal(isClean(await fixture('h0-review-blocking.json')), false);
});

test('blockingFindings returns exactly the blocking findings, in order', async () => {
  const blocking = blockingFindings(await fixture('h0-review-blocking.json'));
  assert.deepEqual(blocking.map((f) => f.id), ['REV-1']);
});

test('an ignored verdict field cannot fool isClean', async () => {
  const review = await fixture('h0-review-blocking.json');
  review.verdict = 'clean'; // a stale/forged field must never override the real computation
  assert.equal(isClean(review), false);
});

test('REVIEW_SCHEMA_VERSION is 1', () => {
  assert.equal(REVIEW_SCHEMA_VERSION, 1);
});
