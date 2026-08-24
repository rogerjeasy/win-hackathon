import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderStack, buildComplianceSeed, applyStack }
  from '../../scripts/lib/stack-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { requirementKey } from '../../scripts/lib/stack-schema.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const fixture = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

function section(md, heading, nextHeading) {
  const from = md.indexOf(heading);
  assert.notEqual(from, -1, `missing section: ${heading}`);
  const to = nextHeading ? md.indexOf(nextHeading, from) : md.length;
  return md.slice(from, to === -1 ? md.length : to);
}

test('the shape and its rationale come before the slot table', async () => {
  const md = renderStack(await fixture('h0-stack.json'));
  assert.ok(md.indexOf('next-monolith') < md.indexOf('| Slot |'),
    'the reader needs the shape before the parts list that assumes it');
});

test('every slot appears in the slot table with its source and rationale', async () => {
  const stack = await fixture('h0-stack.json');
  const table = section(renderStack(stack), '## Stack', '## Bleeding edge');
  for (const slot of stack.slots) {
    assert.ok(table.includes(slot.choice), `slot table is missing "${slot.choice}"`);
    assert.ok(table.includes(slot.rationale), `slot table is missing the rationale for ${slot.id}`);
  }
});

test('the thesis-carrying slot is marked in the table', async () => {
  const stack = await fixture('h0-stack.json');
  const table = section(renderStack(stack), '## Stack', '## Bleeding edge');
  const carrier = stack.slots.find((s) => s.thesis_support === 'carries');
  const row = table.split('\n').find((l) => l.includes(carrier.choice));
  assert.match(row, /\bcarries\b/,
    'the slot carrying the thesis must be identifiable at a glance — it is the win argument');
});

test('rejected alternatives are rendered with their reasons', async () => {
  const stack = await fixture('h0-stack.json');
  const rejected = section(renderStack(stack), '## Rejected');
  for (const r of stack.rejected) {
    assert.ok(rejected.includes(r.why_not),
      'a rejected option without its reason is not evidence of a deliberate choice');
  }
});

test('sections with no content are omitted, not emitted empty', () => {
  const bare = {
    schema_version: 1, repo_shape: 'multi-service', shape_rationale: 'Three deployables.',
    slots: [{ id: 'api', choice: 'FastAPI', source: 'default', rationale: 'Default.', thesis_support: 'carries' }],
  };
  const md = renderStack(bare);
  assert.ok(!md.includes('## Rejected'), 'an empty Rejected section is noise');
  assert.ok(!md.includes('## Bleeding edge'));
});

test('compliance is seeded false for every required slot, and only those', async () => {
  const seed = buildComplianceSeed(await fixture('h0-stack.json'));
  assert.deepEqual(Object.values(seed).filter((v) => v !== false), [],
    'nothing is verified at :stack time — :ship and :check flip these');
  assert.ok(Object.keys(seed).length >= 1);
  assert.ok(!Object.keys(seed).includes(undefined),
    'slots without a requirement_ref must not produce an undefined key');
});

test('buildComplianceSeed keys agree exactly with requirementKey over the recon required list', async () => {
  const stack = await fixture('h0-stack.json');
  const recon = await fixture('h0-recon.json');
  const seed = buildComplianceSeed(stack);
  const expectedKeys = new Set((recon.tech?.required ?? []).map((entry) => requirementKey(entry)));
  assert.deepEqual(new Set(Object.keys(seed)), expectedKeys,
    'if these ever diverge, M4 compliance-checker tracks keys nothing ever sets');
});

test('applyStack writes both artifacts and parks the phase at the gate', async () => {
  await withTmpDir(async (root) => {
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.project = { name: 'Kintwadi', selected_idea: 'i1' };
    await writeState(root, state);

    const stack = await fixture('h0-stack.json');
    const { artifacts } = await applyStack(root, stack, { recon: await fixture('h0-recon.json') });

    assert.deepEqual(artifacts, ['.hackathon/stack.json', '.hackathon/stack.md']);
    const after = await readState(root);
    assert.equal(after.phases.stack.status, 'awaiting_approval',
      'nothing advances without an explicit approval');
    assert.deepEqual(after.phases.stack.artifacts, artifacts);
    assert.equal(after.project.stack.repo_shape, 'next-monolith');
    assert.equal(after.project.stack.ref, '.hackathon/stack.json');
    assert.ok(Object.keys(after.compliance.required_tech_verified).length >= 1);
  });
});

test('applyStack refuses an invalid payload rather than writing half of it', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, createDefaultState({ pluginVersion: '0.1.0' }));
    const bad = { ...(await fixture('h0-stack.json')), repo_shape: 'nope' };
    await assert.rejects(() => applyStack(root, bad), /refusing to apply/);
    const after = await readState(root);
    assert.equal(after.phases.stack.status, 'not_started',
      'a rejected payload must leave the phase untouched');
  });
});

test('a pipe in a slot rationale is escaped, not left to corrupt the table', async () => {
  const stack = await fixture('h0-stack.json');
  stack.slots = [{
    ...stack.slots[0],
    rationale: 'Chosen over DynamoDB | SQLite for relational access.',
  }];
  const table = section(renderStack(stack), '## Stack', '## Bleeding edge');
  const row = table.split('\n').find((l) => l.includes('Chosen over'));
  assert.ok(row.includes('Chosen over DynamoDB \\| SQLite for relational access.'),
    'a raw pipe silently splits the column');
  // Splitting on an unescaped pipe (one not preceded by a backslash) must still find
  // exactly five columns -- a raw pipe in the cell would otherwise split it into six.
  const cells = row.split(/(?<!\\)\|/).slice(1, -1);
  assert.equal(cells.length, 5, 'the row must keep its five-column shape');
});

test('applyStack fails clearly when :init has not run', async () => {
  await withTmpDir(async (root) => {
    const stack = await fixture('h0-stack.json');
    await assert.rejects(() => applyStack(root, stack),
      /run \/win-hackathon:init/);
  });
});
