import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRequirements, REQUIREMENTS_SCHEMA_VERSION, PRIORITIES }
  from '../../scripts/lib/requirements-schema.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));
const golden = () => fx('h0-requirements.json');
const upstream = async () => ({ recon: await fx('h0-recon.json'), architecture: await fx('h0-architecture.json') });

test('the golden fixture validates against the real recon and architecture', async () => {
  const { valid, errors } = validateRequirements(await golden(), await upstream());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the vocabularies are exactly as specified', () => {
  assert.equal(REQUIREMENTS_SCHEMA_VERSION, 1);
  assert.deepEqual(PRIORITIES, ['must', 'should', 'wont']);
});

test('never throws on malformed input', () => {
  for (const bad of [null, undefined, 'nope', 42, []]) {
    assert.doesNotThrow(() => validateRequirements(bad));
    assert.equal(validateRequirements(bad).valid, false);
  }
});

test('a rubric criterion with no feature at all is an ERROR', async () => {
  const r = await golden();
  const up = await upstream();
  const orphan = up.recon.criteria.items.at(-1).id;
  for (const f of r.features) f.criterion_refs = f.criterion_refs.filter((c) => c !== orphan);
  const { valid, errors } = validateRequirements(r, up);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes(orphan)),
    `a criterion nothing is built for scores zero on a weighted axis; got: ${errors.join('; ')}`);
});

test('a criterion covered only by a should-feature is a WARNING, not an error', async () => {
  const r = await golden();
  const up = await upstream();
  r.features[1].priority = 'should';
  const { valid, warnings } = validateRequirements(r, up);
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /only by|non-must|should/i.test(w)), warnings.join('; '));
});

test('a criterion_ref that is not in the rubric is an error', async () => {
  const r = await golden();
  r.features[0].criterion_refs.push('invented-criterion');
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /invented-criterion/.test(e)), errors.join('; '));
});

test('a must feature with no scenario is an error', async () => {
  const r = await golden();
  r.features[0].scenarios = [];
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /scenario/i.test(e)), errors.join('; '));
});

test('a should feature with no scenario is fine', async () => {
  const r = await golden();
  r.features[1].priority = 'should';
  r.features[1].scenarios = [];
  const up = await upstream();
  const { errors } = validateRequirements(r, up);
  assert.deepEqual(errors.filter((e) => /scenario/i.test(e)), []);
});

test('a malformed FR id is an error', async () => {
  const r = await golden();
  r.features[0].requirements[0].id = 'FR1';
  assert.equal(validateRequirements(r, await upstream()).valid, false);
});

test('duplicate FR ids across features are an error', async () => {
  const r = await golden();
  r.features[1].requirements[0].id = r.features[0].requirements[0].id;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /duplicate/i.test(e)), errors.join('; '));
});

test('a scenario pointing at an FR in another feature is an error', async () => {
  const r = await golden();
  r.features[1].scenarios[0].requirement_ref = 'FR-1.1';
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /requirement_ref/.test(e)), errors.join('; '));
});

test('an unknown component_ref errors with architecture, warns without it', async () => {
  const r = await golden();
  r.features[0].component_refs.push('ghost');
  const up = await upstream();
  assert.equal(validateRequirements(r, up).valid, false);
  const { valid, warnings } = validateRequirements(r, { recon: up.recon });
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /architecture/i.test(w)), warnings.join('; '));
});

test('an unknown invariant_ref is an error when the architecture is present', async () => {
  const r = await golden();
  r.features[0].requirements[0].invariant_refs = ['no-such-invariant'];
  assert.equal(validateRequirements(r, await upstream()).valid, false);
});

test('an empty given, when or then is an error', async () => {
  for (const key of ['given', 'when', 'then']) {
    const r = await golden();
    r.features[0].scenarios[0][key] = [];
    const { valid, errors } = validateRequirements(r, await upstream());
    assert.equal(valid, false, `${key} must not be empty`);
    assert.ok(errors.some((e) => e.includes(key)), errors.join('; '));
  }
});

test('no demo_moment anywhere is a warning', async () => {
  const r = await golden();
  for (const f of r.features) f.demo_moment = false;
  const { valid, warnings } = validateRequirements(r, await upstream());
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /demo/i.test(w)), warnings.join('; '));
});

test('a slug that is not filesystem-safe is an error', async () => {
  const r = await golden();
  r.features[0].slug = 'Shared Care Record/v2';
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /slug/.test(e)),
    'the slug becomes a filename in three places');
});

test('duplicate slugs are an error', async () => {
  const r = await golden();
  r.features[1].slug = r.features[0].slug;
  assert.equal(validateRequirements(r, await upstream()).valid, false);
});
