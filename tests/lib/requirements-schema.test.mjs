import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRequirements, REQUIREMENTS_SCHEMA_VERSION, PRIORITIES, FR_ID_RE }
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
  assert.equal(FR_ID_RE.test('FR-1.1'), true);
  assert.equal(FR_ID_RE.test('FR1'), false);
  assert.equal(FR_ID_RE.test('FR-1.1.1'), false);
});

test('never throws on malformed input', () => {
  for (const bad of [null, undefined, 'nope', 42, []]) {
    assert.doesNotThrow(() => validateRequirements(bad));
    assert.equal(validateRequirements(bad).valid, false);
  }
});

test('a null options argument does not throw (only undefined triggers the default)', async () => {
  const r = await golden();
  assert.doesNotThrow(() => validateRequirements(r, null));
  assert.equal(validateRequirements(r, null).valid, true);
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

test('an absent recon degrades rubric coverage to a warning, not an error', async () => {
  // Every other test in this file supplies a real recon. Hardening this branch to a hard
  // error — which would reject every requirements doc written before a recon exists — still
  // passes all of them; only a test that omits recon entirely can catch that regression.
  const r = await golden();
  const { valid, warnings } = validateRequirements(r, {});
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /recon/.test(w)), warnings.join('; '));
});

test('a recon that is present but has a malformed criteria.items also degrades to a warning', async () => {
  // Sibling of the absent-recon case above: recon is truthy here, so the branch must say
  // "supplied but malformed", not silently behave as if recon were absent altogether.
  const r = await golden();
  const { valid, warnings } = validateRequirements(r, { recon: { criteria: { items: 'nope' } } });
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /recon supplied but criteria\.items/.test(w)), warnings.join('; '));
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
  // 'FR1' also orphans the scenario whose requirement_ref is 'FR-1.1' (own-id bookkeeping
  // no longer contains it), so asserting only `valid === false` would pass even if the
  // FR_ID_RE format check were disabled entirely — the scenario check alone would still
  // fail. Assert the specific format-rule message so the test can only pass because that
  // check actually ran.
  const r = await golden();
  r.features[0].requirements[0].id = 'FR1';
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /"FR1" must match FR-<n>\.<n>/.test(e)), errors.join('; '));
});

test('duplicate FR ids across features are an error', async () => {
  const r = await golden();
  const dupId = r.features[0].requirements[0].id;
  r.features[1].requirements[0].id = dupId;
  // Keep feature 2's own scenario pointing at the (now-duplicate) id it declares. Without
  // recording the duplicate id in feature 2's `own` set, that scenario reference would
  // *also* be flagged as pointing at an FR the feature doesn't declare — a bookkeeping
  // artifact of processing order, not a real problem, since feature 2 does declare it.
  r.features[1].scenarios[0].requirement_ref = dupId;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /duplicate/i.test(e)), errors.join('; '));
  assert.deepEqual(errors.filter((e) => /not an FR declared by this feature/.test(e)), []);
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

test('a malformed features[].criterion_refs is a structural type error, not a silent empty list', async () => {
  // Round-1's `Array.isArray(x) ? x : []` guard stopped the throw but also stopped the
  // report: a number here fell back to an empty list and the doc validated clean, with the
  // only sign of trouble being an unrelated-looking "criterion not claimed" message. This
  // asserts the real fault is named at the field, independent of recon being supplied.
  const r = await golden();
  r.features[0].criterion_refs = 42;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.includes('features[0].criterion_refs must be an array of criterion ids'), errors.join('; '));
});

test('a malformed features[].component_refs is a structural type error, not a silent empty list', async () => {
  const r = await golden();
  r.features[0].component_refs = {};
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.includes('features[0].component_refs must be an array of component ids'), errors.join('; '));
});

test('a malformed requirements[].invariant_refs is a structural type error, not a silent empty list', async () => {
  const r = await golden();
  r.features[0].requirements[0].invariant_refs = 42;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(
    errors.includes('features[0].requirements[0].invariant_refs must be an array of invariant ids'),
    errors.join('; '),
  );
});

test('these type errors fire even without an upstream payload — they are about this document, not cross-checking', async () => {
  const r = await golden();
  r.features[0].component_refs = 42;
  const { valid, errors } = validateRequirements(r, {});
  assert.equal(valid, false);
  assert.ok(errors.includes('features[0].component_refs must be an array of component ids'), errors.join('; '));
});

test('an absent criterion_refs, component_refs or invariant_refs is not a type error — only malformed ones are', async () => {
  const r = await golden();
  delete r.features[0].component_refs;
  delete r.features[0].requirements[0].invariant_refs;
  const { errors } = validateRequirements(r, await upstream());
  assert.deepEqual(errors.filter((e) => /must be an array of/.test(e)), []);
});

test('an absent criterion_refs is not a type error, even though it breaks rubric coverage separately', async () => {
  const r = await golden();
  delete r.features[0].criterion_refs;
  const { errors } = validateRequirements(r, await upstream());
  assert.deepEqual(errors.filter((e) => /criterion_refs must be an array/.test(e)), []);
});

test('a malformed architecture.invariants does not throw and does not blanket-error every invariant_ref', async () => {
  // A bare `?? []` on a present-but-wrong-typed value doesn't fall through to the default —
  // it throws when iterated. Each of these shapes is "present" (not undefined/null), so the
  // `architecture` truthy branch is live and the field itself is the wrong type.
  for (const badInvariants of ['nope', { not: 'an array' }, 42]) {
    const architecture = { ...(await fx('h0-architecture.json')), invariants: badInvariants };
    const r = await golden();
    let result;
    assert.doesNotThrow(() => { result = validateRequirements(r, { architecture }); });
    // Consistent with the components-absent branch: degrade to "not checked", not to a
    // hard error against an effectively empty invariant set.
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.ok(result.warnings.some((w) => /invariants/i.test(w)), result.warnings.join('; '));
  }
});

test('a malformed component_refs or requirements on a feature does not throw', async () => {
  const architecture = await fx('h0-architecture.json');
  for (const bad of [42, { not: 'an array' }]) {
    const r = await golden();
    r.features[0].component_refs = bad;
    assert.doesNotThrow(() => validateRequirements(r, { architecture }));

    const r2 = await golden();
    r2.features[0].requirements[0].invariant_refs = bad;
    assert.doesNotThrow(() => validateRequirements(r2, { architecture }));
  }
  for (const bad of ['nope', 42]) {
    const r = await golden();
    r.features[0].requirements = bad;
    assert.doesNotThrow(() => validateRequirements(r, { architecture }));
  }
});

test('a non-array component_refs is a single type error, not per-character noise', async () => {
  // Before the C1 guard, a string `component_refs` would be iterated as individual
  // characters in the cross-check (each one failing the "is not a component" check) — a
  // pile of misleading per-character errors. After C1 alone (round-1 fix), the guard made
  // it silently fall back to an empty list instead — no error at all, which is worse: a
  // malformed field validated clean. The round-2 fix reports it once, at the field, with a
  // message that names the actual fault.
  const r = await golden();
  r.features[0].component_refs = 'web';
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  const componentRefsErrors = errors.filter((e) => /component_refs/.test(e));
  assert.deepEqual(componentRefsErrors, ['features[0].component_refs must be an array of component ids']);
});

test('a missing scenario id is an error', async () => {
  const r = await golden();
  delete r.features[0].scenarios[0].id;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /scenarios\[0\]\.id must be a non-empty string/.test(e)), errors.join('; '));
});

test('duplicate scenario ids across features are an error', async () => {
  // Scenario identity is one level down from feature slug: it becomes the key Task 19 (the
  // .feature file renderer) and Task 21 (the EARS triad emitter) both rely on.
  const r = await golden();
  r.features[1].scenarios[0].id = r.features[0].scenarios[0].id;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /duplicate scenario id/.test(e)), errors.join('; '));
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

test('non_functional is optional — omitting it entirely is fine', async () => {
  const r = await golden();
  delete r.non_functional;
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test('non_functional must be an array when present', async () => {
  const r = await golden();
  r.non_functional = 'nope';
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /non_functional must be an array/.test(e)), errors.join('; '));
});

test('a non-object non_functional entry is an error', async () => {
  const r = await golden();
  r.non_functional.push(null);
  const { valid, errors } = validateRequirements(r, await upstream());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /non_functional\[1\] must be an object/.test(e)), errors.join('; '));
});

test('a non_functional entry missing id, statement or verify is an error', async () => {
  for (const field of ['id', 'statement', 'verify']) {
    const r = await golden();
    delete r.non_functional[0][field];
    const { valid, errors } = validateRequirements(r, await upstream());
    assert.equal(valid, false, `missing ${field} should be an error`);
    assert.ok(errors.some((e) => e.includes(`non_functional[0].${field}`)), errors.join('; '));
  }
});
