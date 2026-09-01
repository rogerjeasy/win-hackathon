import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSubmission, SUBMISSION_SCHEMA_VERSION } from '../../scripts/lib/submission-schema.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('validateSubmission accepts the golden fixture, no recon/state supplied', async () => {
  const { valid, errors, warnings } = validateSubmission(await fx('h0-submission.json'));
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /no recon supplied/.test(w)));
  assert.ok(warnings.some((w) => /no state supplied/.test(w)));
});

test('validateSubmission cross-checks devpost_form field ids and character limits against recon', async () => {
  const submission = await fx('h0-submission.json');
  const recon = await fx('h0-recon.json');
  assert.equal(validateSubmission(submission, { recon }).valid, true);

  submission.devpost_form.fields[0].id = 'not-a-real-field';
  const { valid, errors } = validateSubmission(submission, { recon });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /not-a-real-field.*is not in recon\.submission_form/.test(e)));
});

test('validateSubmission rejects a devpost_form field over its recorded character limit', async () => {
  const submission = await fx('h0-submission.json');
  const recon = await fx('h0-recon.json');
  submission.devpost_form.fields[0].text = 'x'.repeat(61); // project_name's limit is 60
  const { valid, errors } = validateSubmission(submission, { recon });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /project_name.*exceeds its 60-character limit/.test(e)));
});

test('validateSubmission requires video_script shot seconds to sum to total_seconds', async () => {
  const submission = await fx('h0-submission.json');
  submission.video_script.total_seconds = 999;
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /shots\[\].seconds must sum to total_seconds/.test(e)));
});

test('validateSubmission rejects a video script over the 180-second cap', async () => {
  const submission = await fx('h0-submission.json');
  submission.video_script.shots[2].seconds += 20;
  submission.video_script.total_seconds += 20;
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /total_seconds must not exceed 180/.test(e)));
});

test('validateSubmission cross-checks the requirements tracker against state.deliverables', async () => {
  const submission = await fx('h0-submission.json');
  const state = {
    deliverables: {
      submission_requirements: [
        { id: 'text-description', status: 'done' },
        { id: 'demo-video', status: 'not_started' },
        { id: 'architecture-diagram', status: 'done' },
        { id: 'vercel-project-link', status: 'done' },
        { id: 'vercel-team-id', status: 'done' },
        { id: 'db-proof-screenshot', status: 'not_started' },
        { id: 'a-seventh-requirement', status: 'not_started' },
      ],
    },
  };
  const { valid, errors } = validateSubmission(submission, { state });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /a-seventh-requirement.*missing from devpost_form\.requirements_tracker/.test(e)));
});

test('validateSubmission requires bonus_tracker items marked done to carry a url', async () => {
  const submission = await fx('h0-submission.json');
  submission.devpost_form.bonus_tracker[0].url = null;
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /bonus_tracker\[0\].*status "done".*non-null url/.test(e)));
});

test('SUBMISSION_SCHEMA_VERSION is 1', () => {
  assert.equal(SUBMISSION_SCHEMA_VERSION, 1);
});

// Final whole-branch review, finding 2: requirements_tracker[]/bonus_tracker[].status were
// never validated against DELIVERABLE_STATUSES -- a bad status value would sail through
// validateSubmission, write all five rendered files, then throw inside writeState.
test('validateSubmission rejects a requirements_tracker item with a status outside DELIVERABLE_STATUSES', async () => {
  const submission = await fx('h0-submission.json');
  submission.devpost_form.requirements_tracker[0].status = 'complete';
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /requirements_tracker\[0\]\.status must be one of/.test(e)
    && /"complete"/.test(e)));
});

test('validateSubmission rejects a bonus_tracker item with a status outside DELIVERABLE_STATUSES', async () => {
  const submission = await fx('h0-submission.json');
  submission.devpost_form.bonus_tracker[0].status = 'complete';
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /bonus_tracker\[0\]\.status must be one of/.test(e)
    && /"complete"/.test(e)));
});

// Final whole-branch review, finding 7 (deferred at Task 11): a screenshot shot missing
// criterion_ref would render the literal string "undefined" instead of failing validation.
test('validateSubmission rejects a screenshot shot missing criterion_ref', async () => {
  const submission = await fx('h0-submission.json');
  delete submission.screenshots.shots[0].criterion_ref;
  const { valid, errors } = validateSubmission(submission);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /screenshots\.shots\[0\]\.criterion_ref must be a non-empty string/.test(e)));
});
