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
