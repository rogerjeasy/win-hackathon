import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emitGherkin, emitAllGherkin } from '../../scripts/lib/emit-gherkin.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('the user story becomes the feature description block', async () => {
  const r = await fx('h0-requirements.json');
  const f = r.features[0];
  const out = emitGherkin(f);
  assert.match(out, new RegExp(`^Feature: ${f.title}`, 'm'));
  assert.ok(out.includes(`As ${f.user_story.as_a}`));
  assert.ok(!out.includes(`As a ${f.user_story.as_a}`),
    'no double article -- the fixture value already carries its own "a"');
  assert.ok(out.includes(`I want ${f.user_story.i_want}`));
  assert.ok(out.includes(`So that ${f.user_story.so_that}`));
});

test('tags are emitted verbatim, above the scenario', async () => {
  const r = await fx('h0-requirements.json');
  const out = emitGherkin(r.features[0]);
  const lines = out.split('\n');
  const scenarioLine = lines.findIndex((l) => l.trim().startsWith('Scenario:'));
  assert.match(lines[scenarioLine - 1].trim(), /^@/, 'tags must sit directly above their scenario');
  for (const tag of r.features[0].scenarios[0].tags) assert.ok(out.includes(tag));
});

test('repeated steps render as And, never as a second Given', async () => {
  const feature = {
    title: 'T', slug: 't', priority: 'must',
    user_story: { as_a: 'a', i_want: 'b', so_that: 'c' },
    requirements: [{ id: 'FR-1.1', statement: 's' }],
    scenarios: [{ id: 'FR-1.1-S1', name: 'N', requirement_ref: 'FR-1.1',
      given: ['one', 'two'], when: ['act'], then: ['x', 'y'], tags: [] }],
  };
  const out = emitGherkin(feature);
  assert.equal((out.match(/^\s*Given /gm) ?? []).length, 1);
  assert.equal((out.match(/^\s*Then /gm) ?? []).length, 1);
  assert.equal((out.match(/^\s*And /gm) ?? []).length, 2, 'the second given and the second then');
});

test('each scenario carries its FR id as a comment, so a failure is traceable', async () => {
  const r = await fx('h0-requirements.json');
  const out = emitGherkin(r.features[0]);
  for (const s of r.features[0].scenarios) {
    assert.ok(out.includes(s.requirement_ref),
      'a failing scenario must point back at the requirement it proves');
  }
});

test('emitAllGherkin produces one file per feature, keyed by slug', async () => {
  const r = await fx('h0-requirements.json');
  const files = emitAllGherkin(r);
  assert.deepEqual([...files.keys()].sort(), r.features.map((f) => f.slug).sort());
});

test('every scenario in the payload survives into a file', async () => {
  const r = await fx('h0-requirements.json');
  const all = [...emitAllGherkin(r).values()].join('\n');
  const total = r.features.flatMap((f) => f.scenarios).length;
  assert.equal((all.match(/^\s*Scenario: /gm) ?? []).length, total);
});
