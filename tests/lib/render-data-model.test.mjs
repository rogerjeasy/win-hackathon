import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDataModel } from '../../scripts/lib/render-data-model.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

function section(md, heading, next) {
  const from = md.indexOf(heading);
  assert.notEqual(from, -1, `missing section: ${heading}`);
  const to = next ? md.indexOf(next, from) : md.length;
  return md.slice(from, to === -1 ? md.length : to);
}

test('every entity appears in the catalog, under its own group', async () => {
  const a = await fx('h0-architecture.json');
  const md = renderDataModel(a, await fx('h0-stack.json'));
  const catalog = section(md, '## Entity catalog', '## Transactions');
  for (const e of a.entities) {
    assert.ok(catalog.includes(e.name), `catalog is missing ${e.name}`);
    assert.ok(catalog.includes(e.purpose), `catalog is missing the purpose of ${e.name}`);
  }
  for (const group of new Set(a.entities.map((e) => e.group))) {
    assert.ok(catalog.includes(group), `group heading ${group} is missing`);
  }
});

test('the ERD renders as a Mermaid erDiagram with every relationship', async () => {
  const a = await fx('h0-architecture.json');
  const erd = section(renderDataModel(a, await fx('h0-stack.json')),
    '## Entity-relationship diagram', '## Entity catalog');
  assert.match(erd, /```mermaid\n\s*erDiagram/);
  const rels = a.entities.flatMap((e) => e.relationships ?? []);
  assert.equal((erd.match(/\|\|--o\{|\}o--\|\||\}o--o\{|\|\|--\|\|/g) ?? []).length, rels.length);
});

test('the capability matrix lists every role and its capabilities', async () => {
  const a = await fx('h0-architecture.json');
  const rbac = section(renderDataModel(a, await fx('h0-stack.json')),
    '## Role-based access control', '## Access control in one sentence');
  for (const row of a.access_control.capability_matrix) {
    assert.ok(rbac.includes(row.role));
    for (const cap of row.can) assert.ok(rbac.includes(cap), `${row.role} is missing ${cap}`);
  }
});

test('every policy names the tables it applies to', async () => {
  const a = await fx('h0-architecture.json');
  const pol = section(renderDataModel(a, await fx('h0-stack.json')),
    '## Policy design', '## Indexing');
  for (const p of a.access_control.policies) {
    assert.ok(pol.includes(p.rule), `policy ${p.id} is missing its rule`);
    for (const t of p.applies_to) assert.ok(pol.includes(t));
  }
});

test('tenant-scoped entities are visibly marked', async () => {
  const a = await fx('h0-architecture.json');
  const catalog = section(renderDataModel(a, await fx('h0-stack.json')),
    '## Entity catalog', '## Transactions');
  const scoped = a.entities.find((e) => e.tenant_scoped);
  const row = catalog.split('\n').find((l) => l.includes(scoped.name) && l.includes('|'));
  assert.match(row, /\byes\b/i,
    'a reader must be able to see which tables carry tenant data without cross-referencing');
});

test('the "why this database" section names the rejected alternative', async () => {
  const stack = await fx('h0-stack.json');
  const md = renderDataModel(await fx('h0-architecture.json'), stack);
  const db = stack.slots.find((s) => s.id === 'database');
  // Slice on the comparative heading specifically -- '## Why ' alone would match the
  // unconditional opening section ("## Why this data model"), which always exists.
  const why = section(md, '## Why ' + db.choice);
  assert.ok(why.includes(stack.rejected[0].choice),
    'the argument is comparative — it needs the alternative it beat');
  assert.ok(why.includes(stack.rejected[0].why_not));
});

test('with no stack, the why-this-database section is omitted rather than hedged', async () => {
  const md = renderDataModel(await fx('h0-architecture.json'));
  // A bare '## Why ' would also match the unconditional opening section
  // ("## Why this data model"), so the absence check targets the comparative
  // heading shape specifically: "## Why X over Y".
  assert.ok(!/^## Why .+ over /m.test(md), 'a comparison with nothing to compare against is noise');
  assert.ok(md.includes('## Entity catalog'), 'the rest still renders');
});

test('access_control model "none" omits the RLS sections entirely', async () => {
  const a = await fx('h0-architecture.json');
  a.access_control = { model: 'none' };
  const md = renderDataModel(a);
  assert.ok(!md.includes('## Policy design'));
  assert.ok(!md.includes('## Role-based access control'));
  assert.ok(md.includes('## Entity catalog'));
});
