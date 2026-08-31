import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderReview } from '../../scripts/lib/render-review.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('renderReview reports "No findings. Clean." for an empty findings array', () => {
  const md = renderReview({ schema_version: 1, findings: [] });
  assert.match(md, /No findings\. Clean\./);
});

test('renderReview groups blocking before should-fix before post-hackathon', async () => {
  const review = await fixture('h0-review-blocking.json');
  review.findings.push({
    id: 'REV-3', source: 'code-review', severity: 'should-fix',
    title: 'Middle bucket', summary: '…', file: null, line: null, judge_visible: false,
  });
  const md = renderReview(review);
  const blockingAt = md.indexOf('## Blocking');
  const shouldFixAt = md.indexOf('## Should-fix');
  const postAt = md.indexOf('## Post-hackathon');
  assert.ok(blockingAt !== -1 && shouldFixAt !== -1 && postAt !== -1);
  assert.ok(blockingAt < shouldFixAt && shouldFixAt < postAt);
});

test('renderReview cites file:line when present and omits it when null', async () => {
  const review = await fixture('h0-review-blocking.json');
  const md = renderReview(review);
  assert.match(md, /route\.ts:18/);
  const clean = await fixture('h0-review-clean.json');
  clean.findings[0].file = null;
  clean.findings[0].line = null;
  const cleanMd = renderReview(clean);
  assert.doesNotMatch(cleanMd, /:null/);
});

test('renderReview sorts judge_visible findings first within a severity bucket', () => {
  const review = {
    schema_version: 1,
    findings: [
      { id: 'REV-1', source: 'code-review', severity: 'should-fix', title: 'Off-path', summary: '…', file: null, line: null, judge_visible: false },
      { id: 'REV-2', source: 'code-review', severity: 'should-fix', title: 'On-path', summary: '…', file: null, line: null, judge_visible: true },
    ],
  };
  const md = renderReview(review);
  assert.ok(md.indexOf('On-path') < md.indexOf('Off-path'));
});
