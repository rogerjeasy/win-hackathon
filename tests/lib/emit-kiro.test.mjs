import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emitKiro, toEars } from '../../scripts/lib/emit-kiro.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('a scenario renders as one EARS sentence', () => {
  const s = { given: ['I am signed out'], when: ['I open a record page'],
    then: ['I am redirected to sign-in'] };
  const ears = toEars(s);
  assert.match(ears, /^WHILE I am signed out, WHEN I open a record page, THE SYSTEM SHALL I am redirected to sign-in/);
});

test('a scenario with no given drops the WHILE clause', () => {
  const ears = toEars({ given: [], when: ['I submit the form'], then: ['the dose is recorded'] });
  assert.match(ears, /^WHEN I submit the form, THE SYSTEM SHALL/);
  assert.ok(!ears.includes('WHILE'));
});

test('multiple then-clauses are joined, not truncated', () => {
  const ears = toEars({ given: [], when: ['x'], then: ['a', 'b'] });
  assert.ok(ears.includes('a') && ears.includes('b'),
    'dropping a then-clause silently loses an acceptance criterion');
});

test('one directory per must-have, numbered from 0001', async () => {
  const r = await fx('h0-requirements.json');
  const dirs = [...emitKiro(r, await fx('h0-architecture.json')).keys()];
  assert.deepEqual(dirs, ['0001-shared-care-record', '0002-medication-safety']);
});

test('should-have and wont features get no spec folder', async () => {
  const r = await fx('h0-requirements.json');
  r.features[1].priority = 'should';
  const dirs = [...emitKiro(r, await fx('h0-architecture.json')).keys()];
  assert.deepEqual(dirs, ['0001-shared-care-record'],
    'the triad exists to drive the build; a should-have is not being built yet');
});

test('every folder has exactly the three triad files', async () => {
  const r = await fx('h0-requirements.json');
  for (const files of emitKiro(r, await fx('h0-architecture.json')).values()) {
    assert.deepEqual(Object.keys(files).sort(), ['design.md', 'requirements.md', 'tasks.md']);
  }
});

test('requirements.md carries the user story and numbered EARS criteria', async () => {
  const r = await fx('h0-requirements.json');
  const f = r.features[0];
  const md = emitKiro(r, await fx('h0-architecture.json')).get('0001-shared-care-record')['requirements.md'];
  assert.ok(md.includes(`As a ${f.user_story.as_a}`));
  for (const s of f.scenarios) assert.ok(md.includes(s.requirement_ref));
  assert.ok((md.match(/THE SYSTEM SHALL/g) ?? []).length >= f.scenarios.length);
});

test('design.md carries only the architecture slice this feature touches', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0002-medication-safety')['design.md'];
  const f = r.features[1];   // component_refs: web, db — deliberately not dal
  for (const id of f.component_refs) {
    const c = a.components.find((x) => x.id === id);
    assert.ok(md.includes(c.label), `design.md is missing ${id}`);
  }
  const excluded = a.components.find((c) => !f.component_refs.includes(c.id));
  assert.ok(!md.includes(excluded.label),
    'the slice is the point — an agent given the whole architecture gains nothing over reading the file');
});

test('design.md names the invariants the feature must uphold, with enforcement points', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0001-shared-care-record')['design.md'];
  const refs = new Set(r.features[0].requirements.flatMap((x) => x.invariant_refs ?? []));
  for (const ref of refs) {
    const inv = a.invariants.find((i) => i.id === ref);
    assert.ok(md.includes(inv.statement));
    assert.ok(md.includes(inv.enforced_by));
  }
});

test('tasks.md is a numbered checklist and every task cites an FR', async () => {
  const r = await fx('h0-requirements.json');
  const md = emitKiro(r, await fx('h0-architecture.json')).get('0001-shared-care-record')['tasks.md'];
  const boxes = md.match(/^- \[ \] /gm) ?? [];
  assert.ok(boxes.length >= r.features[0].requirements.length);
  for (const req of r.features[0].requirements) {
    assert.ok(md.includes(req.id), `no task cites ${req.id}`);
  }
});

test('emitKiro is deterministic', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  assert.deepEqual([...emitKiro(r, a)], [...emitKiro(r, a)]);
});
