import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderVideoScript, renderScreenshots } from '../../scripts/lib/render-production-aids.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('renderVideoScript lists every shot with a running total and states the cap', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderVideoScript(submission);
  assert.match(md, /170.*180/s);
  for (const shot of submission.video_script.shots) {
    assert.ok(md.includes(shot.label), `missing shot "${shot.label}"`);
    assert.ok(md.includes(shot.script));
  }
});

test('renderScreenshots maps every shot to its judging criterion', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderScreenshots(submission);
  assert.match(md, /storage-config/);
  assert.match(md, /technical-implementation/);
  assert.match(md, /Storage -> show the Aurora connection string/);
});
