import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { renderStack, buildComplianceSeed, applyStack, primaryDatabase }
  from '../../scripts/lib/stack-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { writeState, readState } from '../../scripts/lib/state.mjs';
import { statePath } from '../../scripts/lib/paths.mjs';
import { requirementKey } from '../../scripts/lib/stack-schema.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const exists = async (p) => !!(await readFile(p, 'utf8').catch(() => null));

async function seeded(root) {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(root, state);
  return state;
}

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
  const shape = md.indexOf('next-monolith');
  const table = md.indexOf('| Slot |');
  assert.ok(shape !== -1 && table !== -1, 'both the shape and the slot table must be present');
  assert.ok(shape < table, 'the reader needs the shape before the parts list that assumes it');
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

// Fix 9 (task-18a): validateStack rejects empty slots, so this is unreachable through
// applyStack — but reachable by a direct caller, and it was untested before and after
// Task 17's renderTable refactor. Ruling: empty input renders no table (renderTable's own
// contract, pinned separately in render.test.mjs); this test pins it at the renderStack
// call site too, so Task 19's render-requirements.mjs inherits a decided contract, not an
// ambiguous one.
test('renderStack with no slots keeps the heading but emits no slot table', () => {
  const bare = {
    schema_version: 1, repo_shape: 'multi-service', shape_rationale: 'Three deployables.',
    slots: [],
  };
  const md = renderStack(bare);
  assert.ok(md.includes('## Stack'), 'the section heading must still be present');
  const section = md.slice(md.indexOf('## Stack'));
  assert.ok(!section.includes('| Slot |'), 'no slots means no table, not a header-only table');
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
    assert.equal(after.project.stack.primary_database, 'Amazon Aurora PostgreSQL (Serverless v2, pgvector)',
      'the heuristic result must actually land in state, not just be computable');
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

// --- C1: --dry-run must not touch disk or state -----------------------------------------

test('applyStack with dryRun writes nothing at all', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const stack = await fixture('h0-stack.json');
    const { artifacts } = await applyStack(root, stack,
      { recon: await fixture('h0-recon.json'), dryRun: true });

    assert.ok(artifacts.length > 0, 'it still reports what it would write');
    for (const a of artifacts) {
      assert.equal(await exists(path.join(root, a)), false, `${a} was written during a dry run`);
    }
    const after = await readState(root);
    assert.equal(after.phases.stack.status, 'not_started', 'state must not move on a dry run');
  });
});

// --- I2 (review round 1): a dry run must not migrate state.json to disk -----------------
//
// applyStack() used to call migrateStateFile(root) unconditionally, before checking
// dryRun -- the same class of defect Fix 7 corrected in applyArchitecture(). It matters
// here specifically because the :stack dry-run preview is where this plugin's per-file
// overwrite consent actually happens; a dry run with a side effect undermines that gate.
function v1StateWithProject() {
  const phases = {};
  for (const p of ['recon', 'brainstorm', 'describe', 'stack', 'architect',
    'requirements', 'spec', 'build', 'ship', 'review', 'submit']) {
    phases[p] = { status: 'not_started' };
  }
  return {
    schema_version: 1,
    plugin_version: '0.1.0',
    hackathon: null,
    project: { name: 'Kintwadi', selected_idea: 'i1' },
    phases,
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

test('applyStack --dry-run on an old-schema state.json leaves the file byte-for-byte untouched', async () => {
  await withTmpDir(async (root) => {
    await mkdir(path.dirname(statePath(root)), { recursive: true });
    const rawBefore = JSON.stringify(v1StateWithProject(), null, 2);
    await writeFile(statePath(root), rawBefore, 'utf8');

    const stack = await fixture('h0-stack.json');
    const recon = await fixture('h0-recon.json');
    const { artifacts } = await applyStack(root, stack, { recon, dryRun: true });
    assert.ok(artifacts.length > 0, 'the preview must still be computable from the migrated shape');

    const rawAfter = await readFile(statePath(root), 'utf8');
    assert.equal(rawAfter, rawBefore,
      'a dry run must migrate in memory only -- the on-disk bytes must not change at all');
  });
});

// --- C2: an undescribed project must be refused before anything is written --------------

test('applyStack refuses when project is null, and no artifact exists', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, createDefaultState({ pluginVersion: '0.1.0' })); // project: null
    const stack = await fixture('h0-stack.json');
    const recon = await fixture('h0-recon.json');
    await assert.rejects(() => applyStack(root, stack, { recon }),
      /win-hackathon:describe/);

    assert.equal(await exists(path.join(root, '.hackathon', 'stack.json')), false);
    assert.equal(await exists(path.join(root, '.hackathon', 'stack.md')), false);
    const after = await readState(root);
    assert.equal(after.phases.stack.status, 'not_started', 'state must not move either');
  });
});

// --- I1: a pre-existing artifact is backed up before it is overwritten ------------------

test('a hand-edited stack.md is recoverable from the backup directory after a re-run', async () => {
  await withTmpDir(async (root) => {
    await seeded(root);
    const stack = await fixture('h0-stack.json');
    const recon = await fixture('h0-recon.json');
    await applyStack(root, stack, { recon });

    await writeFile(path.join(root, '.hackathon', 'stack.md'), '# Hand-edited\n\nMine.\n', 'utf8');

    const { backedUp } = await applyStack(root, stack, { recon });
    assert.ok(backedUp.includes('.hackathon/stack.md'), 'no backup was recorded');

    // timestamp() has one-second resolution, so a fast second run can land in the same
    // backup directory as the first -- assert on the newest one rather than the count.
    const backups = (await readdir(path.join(root, '.hackathon', 'backups'))).sort();
    const latest = backups.at(-1);
    const saved = await readFile(
      path.join(root, '.hackathon', 'backups', latest, '.hackathon', 'stack.md'), 'utf8');
    assert.ok(saved.includes('Mine.'), 'the hand-edited content must be recoverable');
  });
});

// --- P3: the required_tech_verified merge must survive a re-run -------------------------

test('a required_tech_verified entry already true survives a re-run of applyStack', async () => {
  await withTmpDir(async (root) => {
    const state = await seeded(root);
    const stack = await fixture('h0-stack.json');
    const recon = await fixture('h0-recon.json');
    const seed = buildComplianceSeed(stack);
    const someKey = Object.keys(seed)[0];
    state.compliance = { last_checked: null, required_tech_verified: { [someKey]: true } };
    await writeState(root, state);

    await applyStack(root, stack, { recon });

    const after = await readState(root);
    assert.equal(after.compliance.required_tech_verified[someKey], true,
      'a re-run of :stack must not un-verify something :check already confirmed');
  });
});

// --- Ledger 5: primaryDatabase() is a user-visible regex ---------------------------------

test('primaryDatabase matches a slot id of "database"', () => {
  const stack = { slots: [{ id: 'database', choice: 'Aurora PostgreSQL' }] };
  assert.equal(primaryDatabase(stack), 'Aurora PostgreSQL');
});

test('primaryDatabase matches a slot id of "db"', () => {
  const stack = { slots: [{ id: 'db', choice: 'SQLite' }] };
  assert.equal(primaryDatabase(stack), 'SQLite');
});

test('primaryDatabase does not match an unrelated slot', () => {
  const stack = { slots: [{ id: 'frontend', choice: 'Next.js' }] };
  assert.equal(primaryDatabase(stack), null);
});

// The heuristic's edge: it is a plain substring/suffix regex, not a semantic check, so it
// has both a false-positive and a false-negative shape. Documented here rather than fixed —
// changing it is a bigger change than this batch (task-18a-brief.md, Fix 2).

test('primaryDatabase edge: "db" must be its own segment (preceded by "-", "_" or start of ' +
  'string) — a slot id that merely ends in the letters "db" with no separator is not matched, ' +
  'a real false negative in the current regex', () => {
  const stack = { slots: [{ id: 'authdb', choice: 'Aurora PostgreSQL' }] };
  assert.equal(primaryDatabase(stack), null,
    'documents the heuristic as written; a semantic fix is out of scope for this batch');
});

test('primaryDatabase edge: "database" matches anywhere in the id, so an unrelated slot whose ' +
  'id merely contains the substring is a false positive', () => {
  const stack = { slots: [{ id: 'user-database-admin-ui', choice: 'Next.js admin page' }] };
  assert.equal(primaryDatabase(stack), 'Next.js admin page',
    'the regex is not anchored to the whole id, so a slot about a database admin UI, not a ' +
    'database itself, is still picked as the "primary database"');
});
