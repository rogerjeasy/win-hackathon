import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout } from '../../scripts/lib/layout.mjs';
import { emitMermaid } from '../../scripts/lib/emit-mermaid.mjs';

const golden = async () =>
  JSON.parse(await readFile(new URL('../fixtures/h0-architecture.json', import.meta.url), 'utf8'));

test('every component appears as a node', async () => {
  const arch = await golden();
  const src = emitMermaid(arch, layout(arch));
  for (const c of arch.components) {
    assert.ok(src.includes(c.id), `node ${c.id} is missing`);
    assert.ok(src.includes(c.label), `label for ${c.id} is missing`);
  }
});

test('every edge appears exactly once', async () => {
  const arch = await golden();
  const src = emitMermaid(arch, layout(arch));
  const arrows = src.split('\n').filter((l) => l.includes('-->'));
  assert.equal(arrows.length, arch.edges.length);
});

test('trust boundaries become subgraphs', async () => {
  const arch = await golden();
  const src = emitMermaid(arch, layout(arch));
  for (const b of arch.trust_boundaries) {
    assert.ok(src.includes(`subgraph ${b.id}`), `boundary ${b.id} is not a subgraph`);
    assert.ok(src.includes(b.label));
  }
  assert.equal((src.match(/^\s*end$/gm) ?? []).length, arch.trust_boundaries.length,
    'every subgraph must be closed exactly once');
});

test('each trust zone gets a classDef and every node is assigned one', async () => {
  const arch = await golden();
  const src = emitMermaid(arch, layout(arch));
  const zones = [...new Set(arch.components.map((c) => c.trust_zone))];
  for (const z of zones) assert.ok(src.includes(`classDef ${z}`), `no classDef for ${z}`);
  for (const c of arch.components) {
    assert.match(src, new RegExp(`class\\s+[^\\n]*\\b${c.id}\\b`),
      `component ${c.id} is never assigned a class`);
  }
});

test('it starts with flowchart TB', async () => {
  const arch = await golden();
  assert.match(emitMermaid(arch, layout(arch)).trimStart(), /^flowchart TB/);
});

test('labels containing quotes, brackets and pipes are escaped', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'a', label: 'A "quoted" [bracket] | pipe', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
    edges: [],
  };
  const src = emitMermaid(arch, layout(arch));
  assert.ok(!src.includes('"quoted"'), 'raw double quotes break the Mermaid node label');
  assert.ok(!/\[bracket\]/.test(src.split('\n').find((l) => l.includes('a['))),
    'raw brackets break the node shape');
  assert.ok(!src.split('\n').find((l) => l.startsWith('  a[')).includes('|'),
    'a raw pipe inside a node label is a Mermaid syntax error');
});

test('a single node with no edges emits valid-looking source', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'only', label: 'Only', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const src = emitMermaid(arch, layout(arch));
  assert.match(src, /^flowchart TB/);
  assert.ok(src.includes('only'));
  assert.ok(!src.includes('-->'));
});

test('nodes are emitted in tier order', async () => {
  const arch = await golden();
  const src = emitMermaid(arch, layout(arch));
  const sorted = [...arch.components].sort((a, b) => a.tier - b.tier);
  let cursor = -1;
  for (const c of sorted) {
    const at = src.indexOf(`${c.id}[`);
    assert.ok(at > cursor, `${c.id} is emitted out of tier order`);
    cursor = at;
  }
});

// Fix 5 (task-18a): an unrecognised trust_zone must get its own visibly distinct classDef,
// never the `public` one — falling back to public silently understates the component's
// privilege. Reachable only via a direct, unvalidated call (validateArchitecture rejects
// this zone), which is why the fixture is hand-built rather than the golden one.
test('an unrecognised trust_zone gets a distinct "unknown" classDef, not the public one', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'ghost', label: 'Ghost', tier: 1, trust_zone: 'quarantined',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const src = emitMermaid(arch, layout(arch));
  const publicDef = src.split('\n').find((l) => l.startsWith('  classDef public '));
  const unknownDef = src.split('\n').find((l) => l.startsWith('  classDef quarantined '));
  assert.equal(publicDef, undefined, 'no public classDef should be emitted at all here');
  assert.ok(unknownDef, 'the unrecognised zone must still get a classDef line');
  assert.match(unknownDef, /stroke:#B91C1C/, 'must use the distinct unknown style');
  assert.doesNotMatch(unknownDef, /fill:#FFFFFF,stroke:#5A6C72,color:#232F3E/,
    'must not silently fall back to the public style');
});
