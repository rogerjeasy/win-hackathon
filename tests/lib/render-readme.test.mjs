import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderReadme } from '../../scripts/lib/render-readme.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('renderReadme places the thesis quote before any other heading', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderReadme(submission);
  const titleAt = md.indexOf('# ');
  const thesisAt = md.indexOf(submission.readme.thesis_quote);
  const firstHeadingAfterTitle = md.indexOf('\n## ', titleAt);
  assert.ok(thesisAt !== -1 && thesisAt < firstHeadingAfterTitle,
    'the thesis quote must appear before the first ## heading, matching kintwadi/karma\'s placement');
});

test('renderReadme leads with the live demo URL when a deploy digest is supplied', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderReadme(submission, { deploy: { primary_url: 'https://h0-demo.vercel.app' } });
  const urlAt = md.indexOf('https://h0-demo.vercel.app');
  const firstHeading = md.indexOf('\n## ');
  assert.ok(urlAt !== -1 && urlAt < firstHeading, 'the live URL must appear before the first ## heading');
});

test('renderReadme includes the demo_data_note only when present, and hackathon_disclosure only when present', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderReadme(submission);
  assert.match(md, /All seeded people and records are fictional\./);
  assert.doesNotMatch(md, /Hackathon Disclosure/);

  submission.readme.hackathon_disclosure = { required_stack: [{ claim: 'Powered by Gemini', evidence: 'src/lib/gemini.ts:9' }] };
  const withDisclosure = renderReadme(submission);
  assert.match(withDisclosure, /## Hackathon Disclosure/);
  assert.match(withDisclosure, /Powered by Gemini/);
});

test('renderReadme security section points at AGENTS.md rather than restating it', async () => {
  const submission = await fx('h0-submission.json');
  const md = renderReadme(submission);
  assert.match(md, /AGENTS\.md/);
});
