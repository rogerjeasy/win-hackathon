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

// Finds the one line in `text` that contains `needle` — used so a test can assert on the
// specific row a value lives in, not on the whole section, which would let a value rendered
// under the wrong column (or a different row entirely) pass unnoticed.
function rowContaining(text, needle) {
  const row = text.split('\n').find((l) => l.includes(needle));
  assert.ok(row, `no row contains "${needle}"`);
  return row;
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

test('a feature with no components renders an em-dash, not a blank cell', async () => {
  const r = await fx('h0-requirements.json');
  r.features[0].component_refs = [];
  const inv = section(renderRequirements(r, await fx('h0-architecture.json')),
    '## Component inventory', '## Functional requirements');
  const row = rowContaining(inv, 'One shared care record');
  assert.ok(row.includes('| — |'), 'an empty component list must render as the standard em-dash placeholder');
});

test('the Definition of Done cites each requirement\'s own proving scenario, not just any FR id', async () => {
  const r = await fx('h0-requirements.json');
  const dod = section(renderRequirements(r, await fx('h0-architecture.json')),
    '## Acceptance criteria', '## Test matrix');
  for (const f of r.features) {
    for (const req of f.requirements) {
      const scenarios = f.scenarios.filter((s) => s.requirement_ref === req.id);
      assert.ok(scenarios.length > 0, `fixture setup: expected a scenario proving ${req.id}`);
      const row = rowContaining(dod, req.id);
      for (const s of scenarios) {
        assert.ok(row.includes(s.id), `${req.id}'s line must be proven by its own scenario ${s.id}`);
      }
    }
  }
});

test('a requirement with no scenario is flagged not demonstrable, not silently dropped', async () => {
  const r = await fx('h0-requirements.json');
  r.features[0].requirements.push({ id: 'FR-1.9', statement: 'An orphaned requirement with no proof.' });
  const dod = section(renderRequirements(r, await fx('h0-architecture.json')),
    '## Acceptance criteria', '## Test matrix');
  const row = rowContaining(dod, 'FR-1.9');
  assert.ok(row.includes('no scenario — not demonstrable'),
    'a requirement nothing proves must say so, not cite a scenario that does not exist');
});

test('the test matrix maps every scenario to its own FR and criteria, not just any occurring elsewhere', async () => {
  const r = await fx('h0-requirements.json');
  const matrix = section(renderRequirements(r, await fx('h0-architecture.json')), '## Test matrix');
  for (const f of r.features) {
    for (const s of f.scenarios) {
      const row = rowContaining(matrix, s.id);
      assert.ok(row.includes(s.requirement_ref),
        `${s.id}'s row must satisfy ${s.requirement_ref}, not blank the Satisfies column`);
      for (const c of f.criterion_refs ?? []) {
        assert.ok(row.includes(c),
          `${s.id}'s row must list criterion ${c}, not blank the Criteria column`);
      }
    }
  }
});

test('the criteria coverage table shows exactly which features claim each criterion', async () => {
  const r = await fx('h0-requirements.json');
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  const cov = section(md, '## Criteria coverage', '## Component inventory');
  for (const c of new Set(r.features.flatMap((f) => f.criterion_refs))) {
    const row = rowContaining(cov, `\`${c}\``);
    const claimants = r.features.filter((f) => (f.criterion_refs ?? []).includes(c));
    for (const f of claimants) {
      assert.ok(row.includes(f.id),
        `${c}'s row must show it is claimed by ${f.id}, not blank the Claimed-by column`);
    }
  }
});

test('tables are built with renderTable, which escapes "|" in cell content', async () => {
  const r = await fx('h0-requirements.json');
  // The "|" lands in a criterion ref, which flows into the *coverage* table specifically —
  // a hand-rolled substitute could reproduce every header above byte-for-byte (headers alone
  // do not prove renderTable ran) while still leaking a raw "|" and shifting that table's
  // columns. Escaping is the one behavior only renderTable actually provides.
  r.features[0].criterion_refs = ['technical-implementation | xss', 'impact'];
  const md = renderRequirements(r, await fx('h0-architecture.json'));
  assert.ok(md.includes('| Criterion | Claimed by |'));
  assert.ok(md.includes('|---|---|'));
  assert.ok(md.includes('| Feature | Priority | Components | Demo moment |'));
  assert.ok(md.includes('| Scenario | Feature | Satisfies | Criteria | Tags |'));

  const cov = section(md, '## Criteria coverage', '## Component inventory');
  assert.ok(cov.includes('technical-implementation \\| xss'),
    'renderTable must escape a "|" in rendered cell content');
  assert.ok(!cov.includes('`technical-implementation | xss`'),
    'the raw, unescaped pipe must not appear in the coverage table — only the escaped form');
});
