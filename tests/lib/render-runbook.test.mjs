import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRunbook } from '../../scripts/lib/render-runbook.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('renderRunbook puts Judge Quick-Start before the full manual walkthrough', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderRunbook(submission);
  const quickAt = md.indexOf('## Judge Quick-Start (no account required)');
  const manualAt = md.indexOf('## Full Manual Walkthrough');
  assert.ok(quickAt !== -1 && manualAt !== -1 && quickAt < manualAt);
});

test('renderRunbook ends with Troubleshooting and states the reset procedure', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderRunbook(submission);
  assert.match(md, /## Troubleshooting/);
  assert.match(md.slice(md.lastIndexOf('## Troubleshooting')), /npm run db:seed/);
});

test('renderRunbook states the expected duration up front', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderRunbook(submission);
  const before = md.slice(0, md.indexOf('## Judge Quick-Start'));
  assert.match(before, /10 minutes?/);
});
