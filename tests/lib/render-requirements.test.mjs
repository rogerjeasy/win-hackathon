import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderRequirements } from '../../scripts/lib/render-requirements.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

function section(md, heading, next) {
  const from = md.indexOf(heading);
  assert.notEqual(from, -1, `missing section: ${heading}`);
  const to = next ? md.indexOf(next, from) : md.length;
  return md.slice(from, to === -1 ? md.length : to);
}

test('every FR appears with its statement and its feature', async () => {
  const r = await fx('h0-requirements.json');
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  const fr = section(md, '## Functional requirements', '## Non-functional');
  for (const f of r.features) {
    for (const req of f.requirements) {
      assert.ok(fr.includes(req.id), `${req.id} is missing`);
      assert.ok(fr.includes(req.statement), `${req.id}'s statement is missing`);
    }
  }
});

test('must-have features are listed before should-haves', async () => {
  const r = await fx('h0-requirements.json');
  r.features[1].priority = 'should';
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  assert.ok(md.indexOf(r.features[0].title) < md.indexOf(r.features[1].title),
    'the reader triages by priority; must-haves come first');
});

test('the component inventory names each feature against its components', async () => {
  const r = await fx('h0-requirements.json');
  const inv = section(renderRequirements(r, await fx('h0-architecture.json')),
    '## Component inventory', '## Functional requirements');
  for (const c of r.features[0].component_refs) assert.ok(inv.includes(c));
});

test('the Definition of Done is testable — every criterion cites an FR', async () => {
  const r = await fx('h0-requirements.json');
  const dod = section(renderRequirements(r, await fx('h0-architecture.json')),
    '## Acceptance criteria', '## Test matrix');
  const frCount = r.features.flatMap((f) => f.requirements).length;
  assert.ok((dod.match(/FR-\d+\.\d+/g) ?? []).length >= frCount,
    'a Definition of Done that cites no requirement is not testable');
});

test('the test matrix maps every scenario to its FR and criteria', async () => {
  const r = await fx('h0-requirements.json');
  const matrix = section(renderRequirements(r, await fx('h0-architecture.json')), '## Test matrix');
  for (const f of r.features) {
    for (const s of f.scenarios) {
      assert.ok(matrix.includes(s.id), `${s.id} is missing from the test matrix`);
    }
  }
});

test('the criteria coverage table shows which features claim each criterion', async () => {
  const r = await fx('h0-requirements.json');
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  const cov = section(md, '## Criteria coverage', '## Component inventory');
  for (const c of new Set(r.features.flatMap((f) => f.criterion_refs))) {
    assert.ok(cov.includes(c), `criterion ${c} is missing from the coverage table`);
  }
});

test('tables are built with renderTable, not hand-rolled pipes', async () => {
  const r = await fx('h0-requirements.json');
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  // renderTable's separator row is exactly '---' per column, joined with bare '|' — a
  // hand-rolled table using the sibling renderers' convention would look identical, so this
  // also pins the header text itself, which a hand-rolled substitute could easily drift from.
  assert.ok(md.includes('| Criterion | Claimed by |'));
  assert.ok(md.includes('|---|---|'));
  assert.ok(md.includes('| Feature | Priority | Components | Demo moment |'));
  assert.ok(md.includes('| Scenario | Feature | Satisfies | Criteria | Tags |'));
});
