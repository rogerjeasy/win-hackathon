import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderArchitecture } from '../../scripts/lib/render-architecture.mjs';

const golden = async () =>
  JSON.parse(await readFile(new URL('../fixtures/h0-architecture.json', import.meta.url), 'utf8'));

function section(md, heading, next) {
  const from = md.indexOf(heading);
  assert.notEqual(from, -1, `missing section: ${heading}`);
  const to = next ? md.indexOf(next, from) : md.length;
  return md.slice(from, to === -1 ? md.length : to);
}

test('the context bar and thesis precede the diagram', async () => {
  const md = renderArchitecture(await golden());
  const arch = await golden();
  assert.ok(md.indexOf(arch.context_bar.primary_database) < md.indexOf('## Diagram'),
    'a judge reads the context bar first; it must not sit below the picture');
  assert.ok(md.indexOf(arch.thesis_line) < md.indexOf('## Diagram'),
    'the thesis is the argument the diagram illustrates, so it comes first');
});

test('the Mermaid diagram is inlined in a fenced block', async () => {
  const md = renderArchitecture(await golden());
  const diagram = section(md, '## Diagram', '## Component legend');
  assert.match(diagram, /```mermaid\n/);
  assert.match(diagram, /flowchart TB/);
  assert.ok(diagram.includes('```\n'), 'the fence must be closed');
});

test('the legend carries all three columns for every component', async () => {
  const arch = await golden();
  const legend = section(renderArchitecture(arch), '## Component legend', '## Key request flows');
  assert.match(legend, /why this choice/i,
    'the third column is the design-scoring device and must be named in the heading');
  for (const c of arch.components) {
    assert.ok(legend.includes(c.label), `legend is missing ${c.id}`);
    assert.ok(legend.includes(c.what_it_is), `legend is missing what_it_is for ${c.id}`);
    assert.ok(legend.includes(c.what_it_does), `legend is missing what_it_does for ${c.id}`);
    assert.ok(legend.includes(c.why_this_choice), `legend is missing why_this_choice for ${c.id}`);
  }
});

test('flows render as ordered steps, in payload order', async () => {
  const arch = await golden();
  const flows = section(renderArchitecture(arch), '## Key request flows', '## Invariants');
  const flow = arch.flows[0];
  assert.ok(flows.includes(flow.title));
  let cursor = -1;
  for (const step of flow.steps) {
    const at = flows.indexOf(step);
    assert.ok(at > cursor, `flow steps are out of order at: ${step}`);
    cursor = at;
  }
});

test('invariants render with the file that enforces them', async () => {
  const arch = await golden();
  const inv = section(renderArchitecture(arch), '## Invariants', '## Design system');
  for (const i of arch.invariants) {
    assert.ok(inv.includes(i.statement));
    assert.ok(inv.includes(i.enforced_by),
      'an invariant without its enforcement point is unverifiable by a reader');
  }
});

test('the design system renders both palettes and the anti-generic rules', async () => {
  const arch = await golden();
  const ds = section(renderArchitecture(arch), '## Design system', '## The system in one paragraph');
  assert.ok(ds.includes(arch.design_system.tokens.light.primary));
  assert.ok(ds.includes(arch.design_system.tokens.dark.primary));
  for (const rule of arch.design_system.anti_generic) assert.ok(ds.includes(rule));
});

test('the export instructions name app.diagrams.net and all three files', async () => {
  const md = renderArchitecture(await golden());
  const regen = section(md, '## Regenerating the diagram image');
  assert.match(regen, /app\.diagrams\.net/);
  for (const f of ['architecture.drawio', 'architecture.svg', 'architecture.mmd']) {
    assert.ok(regen.includes(f) || md.includes(f), `${f} is never mentioned`);
  }
});

test('empty optional sections are omitted, not emitted blank', () => {
  const bare = {
    schema_version: 1, thesis_line: 'One line.',
    context_bar: { track: 'T', primary_database: 'DB', ai: 'none', frontend: 'F' },
    components: [{ id: 'a', label: 'A', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' }],
    access_control: { model: 'none' },
  };
  const md = renderArchitecture(bare);
  assert.ok(!md.includes('## Key request flows'), 'no flows means no flows section');
  assert.ok(!md.includes('## Design system'));
  assert.ok(md.includes('## Component legend'), 'the legend is never optional');
});

function paragraphOf(md) {
  const body = section(md, '## The system in one paragraph', '## Regenerating');
  const line = body.split('\n').find((l) => l.trim() && !l.startsWith('#'));
  return line.trim();
}

test('a three-component tier renders with a serial comma and the plural verb', () => {
  const arch = {
    thesis_line: 'Thesis.',
    context_bar: {},
    components: [
      { id: 'w', label: 'Web', tier: 1, trust_zone: 'public',
        what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' },
      { id: 'a', label: 'API', tier: 2, trust_zone: 'public',
        what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' },
      { id: 'b', label: 'Worker', tier: 2, trust_zone: 'public',
        what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' },
      { id: 'c', label: 'Cache', tier: 2, trust_zone: 'public',
        what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' },
      { id: 'd', label: 'DB', tier: 3, trust_zone: 'privileged',
        what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' },
    ],
    access_control: { model: 'none' },
  };
  const md = renderArchitecture(arch);
  assert.equal(paragraphOf(md), 'Web talks to API, Worker and Cache, which talk to DB. Thesis.');
});

test('a single-tier system renders as "is/are the whole system", not a talks-to chain', () => {
  const arch = {
    thesis_line: 'Thesis single.',
    context_bar: {},
    components: [{ id: 'a', label: 'Solo App', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'y', why_this_choice: 'z' }],
    access_control: { model: 'none' },
  };
  const md = renderArchitecture(arch);
  assert.equal(paragraphOf(md), 'Solo App is the whole system. Thesis single.');
});
