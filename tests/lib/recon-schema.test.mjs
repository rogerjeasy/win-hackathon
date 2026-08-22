import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRecon, DATE_KINDS, TIEBREAKS, WEIGHTINGS }
  from '../../scripts/lib/recon-schema.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('the golden H0 fixture validates', async () => {
  const { valid, errors } = validateRecon(await golden());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the vocabularies are exactly as specified', () => {
  assert.deepEqual(DATE_KINDS, ['hard', 'action', 'informational']);
  assert.deepEqual(TIEBREAKS, ['listed_order', 'judge_vote', 'unspecified']);
  assert.deepEqual(WEIGHTINGS, ['equal', 'weighted']);
});

test('rejects a non-object', () => {
  assert.equal(validateRecon(null).valid, false);
  assert.equal(validateRecon('nope').valid, false);
});

test('rejects a wrong schema_version', async () => {
  const r = await golden();
  r.schema_version = 2;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /schema_version/.test(e)));
});

test('rejects non-contiguous criterion ranks', async () => {
  const r = await golden();
  r.criteria.items[3].rank = 9;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /contiguous/.test(e)));
});

test('rejects duplicate criterion ids', async () => {
  const r = await golden();
  r.criteria.items[1].id = r.criteria.items[0].id;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /duplicate/.test(e)));
});

test('rejects a criterion with no quote', async () => {
  const r = await golden();
  r.criteria.items[0].quote = '';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /quote/.test(e)));
});

test('rejects weighted criteria whose weights do not sum to 1', async () => {
  const r = await golden();
  r.criteria.weighting = 'weighted';
  r.criteria.items[0].weight = 0.9;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /sum/.test(e)));
});

test('does not police weights when the weighting is equal', async () => {
  const r = await golden();
  r.criteria.weighting = 'equal';
  for (const item of r.criteria.items) item.weight = 999;
  assert.equal(validateRecon(r).valid, true, 'equal weighting derives weights, never trusts them');
});

test('rejects a date without an explicit offset', async () => {
  const r = await golden();
  r.dates[0].at = '2026-06-29T17:00:00';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /offset/.test(e)));
});

test('rejects an unknown date kind', async () => {
  const r = await golden();
  r.dates[1].kind = 'soonish';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /soonish/.test(e)));
});

test('requires exactly one hard date', async () => {
  const r = await golden();
  r.dates.push({ ...r.dates[0], label: 'a second deadline' });
  let res = validateRecon(r);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /exactly one/.test(e)));

  const r2 = await golden();
  for (const d of r2.dates) d.kind = 'informational';
  res = validateRecon(r2);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /exactly one/.test(e)));
});

test('rejects a hard submission requirement with no quote', async () => {
  const r = await golden();
  const hard = r.submission_requirements.find((s) => s.hard);
  hard.quote = '';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => new RegExp(hard.id).test(e)));
});

test('allows a soft submission requirement with no quote', async () => {
  const r = await golden();
  r.submission_requirements.push({ id: 'nice-to-have', hard: false, requirement: 'a screenshot' });
  assert.equal(validateRecon(r).valid, true);
});

test('rejects observed gallery entries when the gallery is not available', async () => {
  const r = await golden();
  assert.equal(r.landscape.gallery_available, false, 'fixture is a live, pre-announcement hackathon');
  r.landscape.entries_observed = 412;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /entries_observed/.test(e)));
});

test('allows observed gallery entries once the gallery is available', async () => {
  const r = await golden();
  r.landscape.gallery_available = true;
  r.landscape.entries_observed = 412;
  assert.equal(validateRecon(r).valid, true);
});

test('a non-empty unresolved list is still valid', async () => {
  const r = await golden();
  r.unresolved = ['Could not determine whether teams may share one AWS account.'];
  const { valid } = validateRecon(r);
  assert.equal(valid, true, 'recon may complete without knowing everything — it may not guess');
});

test('unknown top-level keys warn but do not fail', async () => {
  const r = await golden();
  r.sponsor_swag = ['stickers'];
  const { valid, warnings } = validateRecon(r);
  assert.equal(valid, true, 'a richer extraction must not be punished');
  assert.ok(warnings.some((w) => /sponsor_swag/.test(w)));
});

test('rejects an empty criteria list', async () => {
  const r = await golden();
  r.criteria.items = [];
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /at least one/.test(e)));
});

test('reports every error at once rather than stopping at the first', async () => {
  const r = await golden();
  r.criteria.items[0].quote = '';
  r.dates[0].at = 'June 29';
  const { errors } = validateRecon(r);
  assert.ok(errors.length >= 2, 'an agent retrying needs the whole list, not one error at a time');
});
