import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emitKiro, toEars } from '../../scripts/lib/emit-kiro.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

// Returns the text under a Markdown '## Heading' line, up to (excluding) the next '## ' heading
// or end of file. Returns null when the heading is absent. Scopes an assertion to "under the
// right heading" instead of "somewhere in the file".
function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

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

test('multiple given-clauses are joined, not truncated', () => {
  const ears = toEars({ given: ['a', 'b'], when: ['x'], then: ['y'] });
  assert.ok(ears.includes('a') && ears.includes('b'),
    'dropping a given-clause silently loses a precondition');
});

test('multiple when-clauses are joined, not truncated', () => {
  const ears = toEars({ given: [], when: ['a', 'b'], then: ['y'] });
  assert.ok(ears.includes('a') && ears.includes('b'),
    'dropping a when-clause silently loses a trigger');
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

test('requirements.md carries the user story under its own heading, and numbered EARS criteria', async () => {
  const r = await fx('h0-requirements.json');
  const f = r.features[0];
  const md = emitKiro(r, await fx('h0-architecture.json')).get('0001-shared-care-record')['requirements.md'];
  const story = section(md, '## User story');
  assert.ok(story, 'requirements.md is missing the ## User story heading');
  // No literal "a " prefix — f.user_story.as_a already reads as a full noun phrase ("a
  // caregiver...", "an adult child..."); prefixing "a " doubles the article.
  assert.ok(story.includes(`As ${f.user_story.as_a}`));
  assert.ok(story.includes(`I want ${f.user_story.i_want}`));
  assert.ok(story.includes(`So that ${f.user_story.so_that}`));
  for (const s of f.scenarios) assert.ok(md.includes(s.requirement_ref));
  assert.ok((md.match(/THE SYSTEM SHALL/g) ?? []).length >= f.scenarios.length);
});

test('design.md carries only the architecture slice this feature touches', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0002-medication-safety')['design.md'];
  const f = r.features[1];   // component_refs: web, db — deliberately not dal
  const comps = section(md, '## Components');
  assert.ok(comps, 'design.md is missing the ## Components heading');
  for (const id of f.component_refs) {
    const c = a.components.find((x) => x.id === id);
    assert.ok(comps.includes(c.label), `design.md is missing ${id}`);
  }
  const excluded = a.components.find((c) => !f.component_refs.includes(c.id));
  assert.ok(!md.includes(excluded.label),
    'the slice is the point — an agent given the whole architecture gains nothing over reading the file');
});

test('design.md explains when a feature declares no component references', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  r.features[1].component_refs = [];
  const md = emitKiro(r, a).get('0002-medication-safety')['design.md'];
  const comps = section(md, '## Components');
  assert.ok(comps, 'design.md is missing the ## Components heading');
  assert.ok(comps.trim().length > 0,
    'an empty Components section should say so in prose, not sit silent under a bare heading');
  assert.ok(!/^### /m.test(comps), 'no components were referenced, so no component subsection should render');
});

test('design.md names the invariants the feature must uphold, with enforcement points', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0001-shared-care-record')['design.md'];
  const refs = new Set(r.features[0].requirements.flatMap((x) => x.invariant_refs ?? []));
  const invSection = section(md, '## Invariants this feature must uphold');
  assert.ok(invSection, 'design.md is missing the Invariants heading');
  for (const ref of refs) {
    const inv = a.invariants.find((i) => i.id === ref);
    assert.ok(invSection.includes(inv.statement));
    assert.ok(invSection.includes(inv.enforced_by));
  }
});

test('design.md excludes an invariant this feature does not reference', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0002-medication-safety')['design.md'];
  const f = r.features[1];
  const refs = new Set(f.requirements.flatMap((x) => x.invariant_refs ?? []));
  const excludedInv = a.invariants.find((i) => !refs.has(i.id));
  assert.ok(excludedInv, 'fixture must carry an invariant this feature does not reference');
  assert.ok(!md.includes(excludedInv.statement),
    'an invariant this feature does not reference must not leak into its design.md');
});

test('design.md omits the Invariants heading when the feature references none', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  r.features[1].requirements[0].invariant_refs = [];
  const md = emitKiro(r, a).get('0002-medication-safety')['design.md'];
  assert.ok(!md.includes('## Invariants this feature must uphold'));
});

test('design.md gives the Data section its own honest framing, not the Components slice claim', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  const md = emitKiro(r, a).get('0001-shared-care-record')['design.md'];
  const data = section(md, '## Data');
  assert.ok(data, 'design.md is missing the ## Data heading');
  assert.ok(/every tenant-scoped entity/i.test(data),
    'entities carry nothing that ties one to a feature, so Data cannot claim to be a slice');
});

test("design.md's Flows heuristic also matches a component by id, not only by label", async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  // The fixture's only flow never names a component by its label ("Next.js on Vercel", "Data
  // access layer", "Aurora PostgreSQL") — it says "The DAL opens a transaction...". Only an id
  // match ("dal") recovers it. F1 (shared-care-record) references the dal component; F2 does
  // not, so the flow surfaces under F1's folder, not F2's.
  const md = emitKiro(r, a).get('0001-shared-care-record')['design.md'];
  const flows = section(md, '## Flows');
  assert.ok(flows, 'a flow naming a component only by id, not by label, should still surface');
  assert.ok(flows.includes('Recording a medication dose'));
});

test('tasks.md is a numbered checklist and every task cites an FR on its own line', async () => {
  const r = await fx('h0-requirements.json');
  // F1 has 2 requirements, which happens to equal the Validation section's fixed 2 checkbox
  // lines — a regex that only ever matches those 2 zero-indented lines would pass here by
  // coincidence. Push a 3rd requirement so the count can no longer coincide.
  r.features[0].requirements.push({
    id: 'FR-1.3', statement: 'A member can search across the circles they belong to.',
  });
  const reqs = r.features[0].requirements;
  const md = emitKiro(r, await fx('h0-architecture.json')).get('0001-shared-care-record')['tasks.md'];
  // Checkbox lines under each requirement are indented 3 spaces; only the Validation section's
  // 2 lines sit at column 0. Anchoring to zero indentation only would undercount.
  const boxes = md.match(/^\s*- \[ \] /gm) ?? [];
  assert.equal(boxes.length, 5 * reqs.length + 2,
    'each requirement contributes 5 checkbox lines and Validation a fixed 2 — a mismatch here ' +
    'means either the per-requirement checklist or its markers went missing');
  for (const req of reqs) {
    assert.match(md, new RegExp(`^\\d+\\. \\*\\*${req.id}\\*\\* `, 'm'),
      `no numbered task line cites ${req.id} (a bare substring check would also accept an ` +
      `unrelated scenario id like ${req.id}-S1)`);
  }
});

test('emitKiro is deterministic', async () => {
  const r = await fx('h0-requirements.json');
  const a = await fx('h0-architecture.json');
  assert.deepEqual([...emitKiro(r, a)], [...emitKiro(r, a)]);
});
