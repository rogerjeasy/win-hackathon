import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateArchitecture, ARCHITECTURE_SCHEMA_VERSION, TRUST_ZONES, ACCESS_MODELS }
  from '../../scripts/lib/architecture-schema.mjs';

const fixture = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));
const golden = () => fixture('h0-architecture.json');
const stack = () => fixture('h0-stack.json');

test('the golden fixture validates against the golden stack', async () => {
  const { valid, errors } = validateArchitecture(await golden(), await stack());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the vocabularies are exactly as specified', () => {
  assert.equal(ARCHITECTURE_SCHEMA_VERSION, 1);
  assert.deepEqual(TRUST_ZONES, ['public', 'authenticated', 'privileged', 'external']);
  assert.deepEqual(ACCESS_MODELS, ['rls', 'app-layer', 'none']);
});

test('never throws on malformed input', () => {
  for (const bad of [null, undefined, 'nope', 42, []]) {
    assert.doesNotThrow(() => validateArchitecture(bad));
    assert.equal(validateArchitecture(bad).valid, false);
  }
});

test('never throws on malformed nested values', async () => {
  const base = await golden();
  const cases = [
    ['components entry is a string', { ...base, components: ['nope'] }],
    ['edges is a number', { ...base, edges: 42 }],
    ['access_control is an array', { ...base, access_control: [] }],
  ];
  for (const [label, doc] of cases) {
    assert.doesNotThrow(() => validateArchitecture(doc), label);
    assert.equal(validateArchitecture(doc).valid, false, label);
  }
});

test('a dangling edge endpoint is an error', async () => {
  const a = await golden();
  a.edges.push({ from: 'web', to: 'ghost', label: 'nowhere' });
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /edges\[2\]\.to/.test(e) && /ghost/.test(e)), errors.join('; '));
});

test('a trust boundary naming an unknown component is an error', async () => {
  const a = await golden();
  a.trust_boundaries[0].contains.push('ghost');
  assert.equal(validateArchitecture(a, await stack()).valid, false);
});

// Fix 6 (task-18a): the ledger guessed the schema might already preclude a component id
// appearing in two boundaries' contains[]. It did not — the loop only checked that contains
// was non-empty and that each id was declared. A component claimed twice renders into only
// the later boundary's subgraph (layout.mjs keys its boundary map by component id), so the
// node silently vanishes from the earlier one.
test('a component id claimed by two trust boundaries is an error', async () => {
  const a = await golden();
  // 'db' is already inside the golden fixture's one boundary ('aws'); add a second boundary
  // that claims it too.
  a.trust_boundaries.push({ id: 'second', label: 'Second boundary', contains: ['db'] });
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /trust_boundaries\[1\]\.contains/.test(e) && /"db"/.test(e)
      && /trust_boundaries\[0\]\.contains/.test(e)),
    errors.join('; '),
  );
});

test('tiers must start at 1 and have no gaps', async () => {
  const a = await golden();
  a.components[1].tier = 5;
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /tier/.test(e) && /gap/i.test(e)), errors.join('; '));
});

test('a zero or negative tier is an error', async () => {
  const a = await golden();
  a.components[0].tier = 0;
  assert.equal(validateArchitecture(a, await stack()).valid, false);
});

test('an invariant with no enforced_by is an error — a wish is not an invariant', async () => {
  const a = await golden();
  a.invariants[0].enforced_by = '';
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /enforced_by/.test(e)), errors.join('; '));
});

test('under RLS, a tenant-scoped entity with no policy is an error', async () => {
  const a = await golden();
  a.access_control.policies = a.access_control.policies.filter((p) => p.id !== 'tenant-isolation');
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /membership/.test(e) && /polic/i.test(e)),
    `this is the check that catches a new table shipped without a policy; got: ${errors.join('; ')}`);
});

test('app-layer access control does not require policies', async () => {
  const a = await golden();
  a.access_control = { model: 'app-layer', session_context: 'req.user', capability_matrix: [], policies: [] };
  assert.equal(validateArchitecture(a, await stack()).valid, true);
});

test('an unknown stack_slot is an error when the stack is present', async () => {
  const a = await golden();
  a.components[0].stack_slot = 'nonexistent';
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /stack_slot/.test(e)), errors.join('; '));
});

test('the same unknown stack_slot is only a warning when the stack is absent', async () => {
  const a = await golden();
  a.components[0].stack_slot = 'nonexistent';
  const { valid, warnings } = validateArchitecture(a);
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /stack/i.test(w)), warnings.join('; '));
});

test('duplicate component ids and duplicate entity names are errors', async () => {
  const a = await golden();
  a.components.push({ ...a.components[0] });
  assert.equal(validateArchitecture(a, await stack()).valid, false);
  const b = await golden();
  b.entities.push({ ...b.entities[0] });
  assert.equal(validateArchitecture(b, await stack()).valid, false);
});

test('a component missing any of the three legend fields is an error', async () => {
  for (const field of ['what_it_is', 'what_it_does', 'why_this_choice']) {
    const a = await golden();
    delete a.components[0][field];
    const { valid, errors } = validateArchitecture(a, await stack());
    assert.equal(valid, false, `${field} must be required`);
    assert.ok(errors.some((e) => e.includes(field)), errors.join('; '));
  }
});

test('no component pointing at a thesis-carrying slot only warns', async () => {
  const a = await golden();
  for (const c of a.components) c.stack_slot = 'frontend';   // frontend is "neutral"
  const { valid, warnings } = validateArchitecture(a, await stack());
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /thesis/i.test(w)), warnings.join('; '));
});

test('design_system missing a dark palette warns', async () => {
  const a = await golden();
  delete a.design_system.tokens.dark;
  const { valid, warnings } = validateArchitecture(a, await stack());
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /dark/i.test(w)), warnings.join('; '));
});

// --- P1: a relationship target must be a declared entity name ---------------------------

test('a relationship pointing at an undeclared entity is an error', async () => {
  const a = await golden();
  a.entities[0].relationships.push({ to: 'phantom_table', kind: 'one-to-many' });
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => e.startsWith('entities[0].relationships[') && e.includes('phantom_table')),
    errors.join('; '),
  );
});

test('a relationship pointing at a later-declared entity is not an error', async () => {
  const a = await golden();
  // membership is declared after care_circle in the fixture — a forward reference must
  // not be flagged just because the target hasn't been seen yet.
  a.entities[0].relationships.push({ to: 'membership', kind: 'one-to-many' });
  const { valid } = validateArchitecture(a, await stack());
  assert.equal(valid, true);
});

// --- I3: flows[].steps and entities[].fields are what the renderers actually consume ----

test('a flow with no steps array is an error, not a raw TypeError from the renderer', async () => {
  const a = await golden();
  a.flows[0].steps = 'not an array';
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.startsWith('flows[0].steps')), errors.join('; '));
});

test('a flow with no title is an error', async () => {
  const a = await golden();
  delete a.flows[0].title;
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.startsWith('flows[0].title')), errors.join('; '));
});

test('entities[].fields must be an array of objects with a name', async () => {
  const a = await golden();
  a.entities[0].fields = 'not an array';
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.startsWith('entities[0].fields')), errors.join('; '));
});

test('a field object with no name is an error', async () => {
  const a = await golden();
  a.entities[0].fields = [{ type: 'uuid' }];
  const { valid, errors } = validateArchitecture(a, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.startsWith('entities[0].fields[0].name')), errors.join('; '));
});
