import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { renderStatusBoard, renderInitPlan, renderTable } from '../../scripts/lib/render.mjs';

test('board shows every phase with its status', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.phases.recon.status = 'approved';
  const out = renderStatusBoard({
    state,
    resolution: { outcome: 'start', phase: 'brainstorm', reason: 'next up', drift: [] },
    tools: [],
  });
  assert.match(out, /recon/);
  assert.match(out, /approved/);
  assert.match(out, /brainstorm/);
});

test('board surfaces drift prominently', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  const out = renderStatusBoard({
    state,
    resolution: {
      outcome: 'drift', phase: 'recon', reason: 'mismatch',
      drift: [{ phase: 'recon', missing: ['.hackathon/brief.md'] }],
    },
    tools: [],
  });
  assert.match(out, /DRIFT/i);
  assert.match(out, /brief\.md/);
});

test('board lists missing tools but not present ones', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  const out = renderStatusBoard({
    state,
    resolution: { outcome: 'start', phase: 'recon', reason: '', drift: [] },
    tools: [
      { name: 'git', present: true, version: '2.4', needate: 'everything', blocking: true },
      { name: 'docker', present: false, version: null, needate: 'containers', blocking: false },
    ],
  });
  assert.match(out, /docker/);
  assert.ok(!/\bgit\b/.test(out.split('Missing tools')[1] ?? ''), 'present tools are not listed as missing');
});

test('init plan render marks which actions need consent', () => {
  const out = renderInitPlan({
    env: { mode: 'adopt', scenarios: ['B', 'E'], foreignAgentFiles: ['CLAUDE.md'] },
    actions: [
      { kind: 'create', path: '.hackathon/state.json', reason: 'phase state', needsConsent: false },
      { kind: 'update-block', path: 'CLAUDE.md', reason: 'pointer', needsConsent: true },
    ],
    warnings: ['worktree is dirty'],
  });
  assert.match(out, /adopt/);
  assert.match(out, /CLAUDE\.md/);
  assert.match(out, /needs your approval/i);
  assert.match(out, /worktree is dirty/);
});

test('init plan render says so when nothing needs consent', () => {
  const out = renderInitPlan({
    env: { mode: 'greenfield', scenarios: ['A', 'E'], foreignAgentFiles: [] },
    actions: [{ kind: 'mkdir', path: '.hackathon', reason: 'workshop', needsConsent: false }],
    warnings: [],
  });
  assert.match(out, /nothing pre-existing/i);
});

function baseState() {
  return createDefaultState({ pluginVersion: '0.1.0' });
}

function stateWithDeliverables() {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0', url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    next_action_deadline: { label: 'credit request form closes', at: '2026-06-26T12:00:00-07:00' },
    tech: { required: ['AWS Database'], bonus: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    tiebreak: 'listed_order', bonus_points_available: 0.6,
    selected_track: 'b2c', recon_ref: '.hackathon/recon.json',
  };
  s.deliverables = {
    submission_requirements: [
      { id: 'demo-video', status: 'not_started' },
      { id: 'architecture-diagram', status: 'done' },
    ],
    bonus_content: [{ id: 'bonus-1', status: 'not_started', url: null }],
  };
  return s;
}

const resolution = { outcome: 'start', phase: 'stack', drift: [], reason: 'Phase "stack" is next.' };

test('the board counts outstanding submission requirements', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /Deliverables/);
  assert.match(out, /1 of 2/);
});

test('the board names the outstanding items, not just a count', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /demo-video/);
});

test('the board does not nag about deliverables already done', () => {
  const s = stateWithDeliverables();
  for (const d of s.deliverables.submission_requirements) d.status = 'done';
  s.deliverables.bonus_content = [];
  const out = renderStatusBoard({ state: s, resolution, tools: [] });
  assert.doesNotMatch(out, /architecture-diagram/);
});

test('the board surfaces the next action deadline separately from the submission deadline', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /credit request form closes/);
  assert.match(out, /2026-06-26/);
});

test('the board shows unclaimed bonus points as points, not as a task', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /\+0\.6|0\.6 bonus/i);
});

test('the board shows the selected track once one is chosen', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /b2c/);
});

test('the board omits the deliverables section entirely before recon', () => {
  const out = renderStatusBoard({
    state: createDefaultState({ pluginVersion: '0.1.0' }), resolution, tools: [],
  });
  assert.doesNotMatch(out, /Deliverables/);
  assert.doesNotMatch(out, /undefined/);
});

test('the board counts a skipped requirement as neither done nor outstanding', () => {
  const s = stateWithDeliverables();
  s.deliverables.submission_requirements = [
    { id: 'demo-video', status: 'done' },
    { id: 'architecture-diagram', status: 'skipped' },
    { id: 'public-repo', status: 'not_started' },
  ];
  const out = renderStatusBoard({ state: s, resolution, tools: [] });
  // The bug this pins: counting "skipped" as "done" would print "2 of 3 done" and tell
  // Roger a submission requirement was finished when he had merely skipped past it.
  assert.match(out, /1 of 3 done/);
  assert.doesNotMatch(out, /2 of 3 done/);
  assert.match(out, /1 skipped/, 'a skipped requirement must stay visible, not vanish');
});

test('a skipped requirement is not listed among the outstanding items', () => {
  const s = stateWithDeliverables();
  s.deliverables.submission_requirements = [
    { id: 'architecture-diagram', status: 'skipped' },
    { id: 'public-repo', status: 'not_started' },
  ];
  const out = renderStatusBoard({ state: s, resolution, tools: [] });
  assert.match(out, /\[ \] public-repo/);
  assert.doesNotMatch(out, /\[ \] architecture-diagram/);
});

test('renderTable emits a header, a separator and one row per entry', () => {
  const md = renderTable(['A', 'B'], [['1', '2'], ['3', '4']]);
  assert.deepEqual(md.split('\n'), ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |']);
});

test('renderTable escapes pipes in cell content', () => {
  const md = renderTable(['A'], [['x | y']]);
  assert.ok(md.includes('x \\| y'), 'a raw pipe in a cell silently splits the column');
});

test('renderTable renders null and undefined cells as an em dash, not "undefined"', () => {
  assert.ok(renderTable(['A'], [[null]]).includes('| — |'));
  assert.ok(renderTable(['A'], [[undefined]]).includes('| — |'));
});

test('renderTable with no rows returns an empty string, not a headerless table', () => {
  assert.equal(renderTable(['A', 'B'], []), '');
});

test('the board summarises the stack once :stack has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi', selected_idea: 'i1',
    stack: { repo_shape: 'next-monolith', primary_database: 'Aurora PostgreSQL' } };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.match(out, /next-monolith/);
  assert.match(out, /Aurora PostgreSQL/);
});

// F24: spec §9 says :status renders stack and architecture summaries; only the stack one existed.
test('the board summarises the architecture once :architect has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi', selected_idea: 'i1', architecture_ref: '.hackathon/architecture.json' };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'requirements', drift: [] } });
  assert.match(out, /Architecture/);
  assert.match(out, /docs\/architecture\.md/);
});

test('the board omits the architecture summary before :architect has run', () => {
  const state = baseState();
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.doesNotMatch(out, /Architecture:/);
});

test('unverified required tech is shown as outstanding, not hidden', () => {
  const state = baseState();
  state.compliance = { last_checked: null, required_tech_verified: { 'aws-database': false, 'vercel-deploy': true } };
  const out = renderStatusBoard({ state, resolution: { outcome: 'start', phase: 'architect', drift: [] } });
  assert.match(out, /aws-database/);
  assert.ok(!/vercel-deploy/.test(out.split('Required tech')[1] ?? ''),
    'verified items are not worth board space; unverified ones are');
});

test('renderStatusBoard lists forbidden tech found, when any', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.compliance.forbidden_tech_found = ['DynamoDB'];
  const board = renderStatusBoard({ state, resolution: { outcome: 'complete', phase: null }, tools: [] });
  assert.match(board, /Forbidden technology found/);
  assert.match(board, /DynamoDB/);
});

test('renderStatusBoard lists cut features, when any', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'x', selected_idea: 'i-1', cut_features: ['FR-05.1'] };
  const board = renderStatusBoard({ state, resolution: { outcome: 'complete', phase: null }, tools: [] });
  assert.match(board, /Cut under :pivot/);
  assert.match(board, /FR-05\.1/);
});
