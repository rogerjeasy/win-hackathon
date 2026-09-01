import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDevpostSubmission } from '../../scripts/lib/render-devpost-submission.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('renderDevpostSubmission renders one section per form field, in order', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderDevpostSubmission(submission);
  const nameAt = md.indexOf('project_name');
  const pitchAt = md.indexOf('elevator_pitch');
  assert.ok(nameAt !== -1 && pitchAt !== -1 && nameAt < pitchAt);
  assert.match(md, /Kintwadi -- one shared record for family caregiving/);
});

test('renderDevpostSubmission includes challenges verbatim', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderDevpostSubmission(submission);
  assert.match(md, /A stray timezone offset in the digest cron/);
});

test('renderDevpostSubmission renders the requirements tracker as a checklist, checked only when done', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderDevpostSubmission(submission);
  assert.match(md, /- \[x\] `text-description`/);
  assert.match(md, /- \[ \] `demo-video`/);
});

test('renderDevpostSubmission renders the bonus tracker with its url when done', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderDevpostSubmission(submission);
  assert.match(md, /- \[x\] `bonus-1`.*https:\/\/dev\.to\/x\/rls-on-aurora/);
});
