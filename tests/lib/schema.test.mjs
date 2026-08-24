import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES } from '../../scripts/lib/paths.mjs';
import {
  CURRENT_SCHEMA_VERSION, PHASE_STATUSES, createDefaultState, validateState,
} from '../../scripts/lib/schema.mjs';

test('phase order matches the spec exactly', () => {
  assert.deepEqual(PHASES, [
    'recon', 'brainstorm', 'describe', 'stack', 'architect',
    'requirements', 'spec', 'build', 'ship', 'review', 'submit',
  ]);
});

test('default state has every phase at not_started', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(s.schema_version, CURRENT_SCHEMA_VERSION);
  assert.equal(s.plugin_version, '0.1.0');
  assert.equal(s.mode, 'solo');
  for (const p of PHASES) assert.equal(s.phases[p].status, 'not_started', p);
});

test('validateState accepts a default state', () => {
  const { valid, errors } = validateState(createDefaultState({ pluginVersion: '0.1.0' }));
  assert.equal(valid, true, errors.join('; '));
});

test('validateState rejects an unknown phase status', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.recon.status = 'done';
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /recon/);
});

test('validateState rejects an unknown phase name', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.deploy = { status: 'approved' };
  const { valid } = validateState(s);
  assert.equal(valid, false);
});

test('validateState rejects a future schema version', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.schema_version = CURRENT_SCHEMA_VERSION + 1;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /schema_version/);
});

test('PHASE_STATUSES is the exact set from the spec', () => {
  assert.deepEqual(PHASE_STATUSES,
    ['not_started', 'in_progress', 'awaiting_approval', 'approved', 'skipped']);
});

// Regression: a hand-edited state.json with `"artifacts": "docs/architecture.md"` (a
// string, not an array) used to pass validation as {valid: true}. resolve-next.mjs's
// `for (const rel of artifacts)` then iterated the string's characters instead of
// throwing or being rejected earlier — producing nonsense drift reports, or crashing
// outright for other malformed shapes. Every phase.artifacts must be an array of strings.
test('validateState rejects a phase whose artifacts is a string instead of an array', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.recon.status = 'approved';
  s.phases.recon.artifacts = 'docs/architecture.md';
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /recon/);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState rejects a phase whose artifacts is null', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.recon.status = 'approved';
  s.phases.recon.artifacts = null;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /recon/);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState rejects a phase whose artifacts array contains a non-string', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.recon.status = 'approved';
  s.phases.recon.artifacts = ['fine.md', 42];
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.match(errors.join(' '), /artifacts/);
});

test('validateState accepts a phase with a proper artifacts array', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.phases.recon.status = 'approved';
  s.phases.recon.artifacts = ['docs/architecture.md', 'docs/brief.md'];
  const { valid, errors } = validateState(s);
  assert.equal(valid, true, errors.join('; '));
});

import { DELIVERABLE_STATUSES } from '../../scripts/lib/schema.mjs';

test('the current schema version is 3', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
});

test('a default state carries an empty deliverables block', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.deepEqual(s.deliverables, { submission_requirements: [], bonus_content: [] });
  assert.equal(validateState(s).valid, true);
});

test('validateState rejects a missing deliverables block', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  delete s.deliverables;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /deliverables/.test(e)));
});

test('validateState rejects a deliverable with an unknown status', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.deliverables.submission_requirements = [{ id: 'demo-video', status: 'nearly' }];
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /nearly/.test(e)));
  assert.ok(DELIVERABLE_STATUSES.includes('not_started'));
});

test('validateState returns a result rather than throwing on a non-array truthy deliverables field', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.deliverables.submission_requirements = {};
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e === 'deliverables.submission_requirements must be an array'));
});

test('validateState accepts a null hackathon (nothing reconned yet)', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(s.hackathon, null);
  assert.equal(validateState(s).valid, true);
});

test('validateState accepts a partial hackathon block', () => {
  // Controller ruling (pre-flight): the state layer validates only what is present.
  // The binding offset guard lives in recon-schema.mjs, where agent-authored dates enter;
  // state.hackathon.deadline is copied from an already-validated hard date. Enforcing it
  // twice would make it impossible for the M1 hook tests to write the malformed states
  // they exist to prove the hook survives.
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = { name: 'Big Hack', deadline: null, tech: { required: ['Bedrock'] } };
  const { valid, errors } = validateState(s);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('validateState still rejects a hackathon with no name', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = { name: '', deadline: null };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /name/.test(e)));
});

test('validateState rejects an unknown tiebreak when one is present', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0', url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    criteria_ids: ['technical-implementation'], tiebreak: 'coin_flip',
  };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /tiebreak/.test(e)));
});

test('schema version is 3', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
});

test('a null project is still valid — :describe has not run yet', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(validateState(s).valid, true);
});

test('a non-null project must carry a name and a selected idea', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: '', selected_idea: 'i1' };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /project\.name/.test(e)), errors.join('; '));
});

test('project.stack must use a known repo shape', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1', stack: { repo_shape: 'microservices' } };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /repo_shape/.test(e)), errors.join('; '));
});

test('a fully populated v3 project validates', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = {
    name: 'Kintwadi',
    selected_idea: 'i1',
    stack: { repo_shape: 'next-monolith', primary_database: 'Aurora', ref: '.hackathon/stack.json' },
    architecture_ref: '.hackathon/architecture.json',
    requirements_ref: '.hackathon/requirements.json',
  };
  assert.deepEqual(validateState(s).errors, []);
});

test('validateState accepts a fully populated hackathon digest', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0: Hack the Zero Stack',
    url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    next_action_deadline: { label: 'credit request form closes', at: '2026-06-26T12:00:00-07:00' },
    tech: { required: ['AWS Database'], bonus: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    tiebreak: 'listed_order',
    bonus_points_available: 0.6,
    selected_track: null,
    recon_ref: '.hackathon/recon.json',
  };
  assert.equal(validateState(s).valid, true);
});
