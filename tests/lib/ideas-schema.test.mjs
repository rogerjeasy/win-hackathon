import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateIdeas } from '../../scripts/lib/ideas-schema.mjs';

async function load(name) {
  const raw = await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  return JSON.parse(raw);
}
const ideas = () => load('h0-ideas.json');
const recon = () => load('h0-recon.json');

test('the golden ideas fixture validates against the golden rubric', async () => {
  const { valid, errors } = validateIdeas(await ideas(), await recon());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('validates standalone when no rubric is supplied', async () => {
  assert.equal(validateIdeas(await ideas()).valid, true);
});

test('warns when standalone validation skips both rubric checks, but not when a full recon is supplied', async () => {
  const d = await ideas();
  const standalone = validateIdeas(d);
  assert.ok(
    standalone.warnings.some((w) => /no recon supplied.*rubric-membership checks were skipped/.test(w)),
    `expected a rubric-membership skipped warning, got: ${JSON.stringify(standalone.warnings)}`,
  );
  assert.ok(
    standalone.warnings.some((w) => /no recon supplied.*score-ceiling checks were skipped/.test(w)),
    `expected a score-ceiling skipped warning, got: ${JSON.stringify(standalone.warnings)}`,
  );

  const withRecon = validateIdeas(d, await recon());
  assert.deepEqual(
    withRecon.warnings, [],
    `did not expect any skipped-checks warning when a full recon is supplied, got: ${JSON.stringify(withRecon.warnings)}`,
  );
});

test('warns about a skipped score-ceiling check specifically when recon has no max_base_score', async () => {
  const d = await ideas();
  const r = await recon();
  delete r.criteria.max_base_score;
  const { valid, warnings } = validateIdeas(d, r);
  assert.equal(valid, true, 'a missing max_base_score degrades validation, it does not invalidate the doc');
  assert.ok(
    warnings.some((w) => /recon supplied but criteria\.max_base_score is missing.*score-ceiling checks were skipped/.test(w)),
    `expected a recon-supplied score-ceiling warning, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(
    warnings.every((w) => !/rubric-membership checks were skipped/.test(w)),
    `did not expect a rubric-membership warning when criteria.items is intact, got: ${JSON.stringify(warnings)}`,
  );
});

test('warns about both checks, correctly attributed to a supplied-but-malformed rubric', async () => {
  const d = await ideas();
  const r = await recon();
  r.criteria.items = [];
  delete r.criteria.max_base_score;
  const { valid, warnings } = validateIdeas(d, r);
  assert.equal(valid, true, 'a malformed rubric degrades validation, it does not invalidate the doc');
  assert.ok(
    warnings.some((w) => /recon supplied but criteria\.items is empty or malformed.*rubric-membership checks were skipped/.test(w)),
    `expected a recon-supplied rubric-membership warning, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(
    warnings.some((w) => /recon supplied but criteria\.max_base_score is missing.*score-ceiling checks were skipped/.test(w)),
    `expected a recon-supplied score-ceiling warning, got: ${JSON.stringify(warnings)}`,
  );
  assert.ok(
    warnings.every((w) => !w.startsWith('no recon supplied')),
    `recon WAS supplied here, so no message should claim otherwise, got: ${JSON.stringify(warnings)}`,
  );
});

test('rejects a non-object', () => {
  assert.equal(validateIdeas(null).valid, false);
});

test('rejects a wrong schema_version', async () => {
  const d = await ideas();
  d.schema_version = 7;
  assert.ok(validateIdeas(d).errors.some((e) => /schema_version/.test(e)));
});

test('rejects a non-positive round number', async () => {
  const d = await ideas();
  d.round = 0;
  assert.ok(validateIdeas(d).errors.some((e) => /round/.test(e)));
});

test('rejects a scored idea that failed the Stage-One gate', async () => {
  const d = await ideas();
  d.ideas[0].stage_one.pass = false;
  const { valid, errors } = validateIdeas(d);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /disqualified/.test(e)));
});

test('rejects a disqualified idea that carries scores', async () => {
  const d = await ideas();
  d.disqualified[0].scores = [{ criterion_id: 'design', score: 4, rationale: 'looks nice' }];
  const { valid, errors } = validateIdeas(d);
  assert.equal(valid, false);
  // Scoring a non-compliant idea is how you fall in love with one that cannot win.
  assert.ok(errors.some((e) => /must not carry scores/.test(e)));
});

test('requires a reason for every disqualification', async () => {
  const d = await ideas();
  d.disqualified[0].stage_one.reasons = [];
  assert.ok(validateIdeas(d).errors.some((e) => /reason/.test(e)));
});

test('requires a thesis on every scored idea', async () => {
  const d = await ideas();
  d.ideas[0].thesis = '';
  assert.ok(validateIdeas(d).errors.some((e) => /thesis/.test(e)));
});

test('requires an inversion on every scored idea', async () => {
  const d = await ideas();
  delete d.ideas[1].inversion;
  assert.ok(validateIdeas(d).errors.some((e) => /inversion/.test(e)));
});

test('requires a demo moment on every scored idea', async () => {
  const d = await ideas();
  d.ideas[0].demo_moment = '   ';
  assert.ok(validateIdeas(d).errors.some((e) => /demo_moment/.test(e)));
});

test('requires a track id on every scored idea', async () => {
  const d = await ideas();
  delete d.ideas[0].track;
  assert.ok(validateIdeas(d).errors.some((e) => /track/.test(e)));
});

test('rejects a criterion id that does not exist in the rubric', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].criterion_id = 'vibes';
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /vibes/.test(e)));
});

test('rejects a scored idea missing a criterion the rubric requires', async () => {
  const d = await ideas();
  d.ideas[0].scores.pop();
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /every criterion/.test(e)));
});

test('rejects a duplicate criterion score on one idea', async () => {
  const d = await ideas();
  d.ideas[0].scores[1].criterion_id = d.ideas[0].scores[0].criterion_id;
  assert.ok(validateIdeas(d, await recon()).errors.some((e) => /duplicate/.test(e)));
});

test('rejects a non-numeric score', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].score = 'high';
  assert.ok(validateIdeas(d).errors.some((e) => /score/.test(e)));
});

test('rejects a score above the rubric maximum', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].score = 9;
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /max_base_score|out of range/.test(e)));
});

test('rejects non-contiguous ranks', async () => {
  const d = await ideas();
  d.ideas[1].rank = 5;
  assert.ok(validateIdeas(d).errors.some((e) => /contiguous/.test(e)));
});

test('rejects duplicate idea ids across scored and disqualified', async () => {
  const d = await ideas();
  d.disqualified[0].id = d.ideas[0].id;
  assert.ok(validateIdeas(d).errors.some((e) => /duplicate/.test(e)));
});

test('accepts a round where every idea was disqualified', async () => {
  const d = await ideas();
  d.disqualified.push(...d.ideas.map((i) => ({
    id: i.id, name: i.name, pitch: i.pitch,
    stage_one: { pass: false, reasons: ['no required database'] },
  })));
  d.ideas = [];
  const { valid } = validateIdeas(d);
  assert.equal(valid, true, 'a round that produced nothing usable is a real, reportable outcome');
});

test('reports every error at once', async () => {
  const d = await ideas();
  d.ideas[0].thesis = '';
  d.ideas[1].demo_moment = '';
  assert.ok(validateIdeas(d).errors.length >= 2);
});
