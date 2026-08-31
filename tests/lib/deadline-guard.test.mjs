import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDeadlinePressure } from '../../scripts/lib/deadline-guard.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

function stateWith(overrides) {
  return { ...createDefaultState({ pluginVersion: '0.1.0' }), ...overrides };
}

test('silent when plenty of time remains', () => {
  const state = stateWith({
    hackathon: { name: 'x', deadline: '2026-09-10T00:00:00Z' },
    budget: { total_hours: 48, spent_hours: 0, phase_budget: {} },
  });
  const result = computeDeadlinePressure(state, { now: new Date('2026-08-30T00:00:00Z') });
  assert.equal(result.warn, false);
});

test('warns when remaining time drops below 25% of the total budget', () => {
  const state = stateWith({
    hackathon: { name: 'x', deadline: '2026-08-31T02:00:00Z' }, // 2h out
    budget: { total_hours: 48, spent_hours: 0, phase_budget: {} }, // 25% of 48 = 12h
  });
  const result = computeDeadlinePressure(state, { now: new Date('2026-08-31T00:00:00Z') });
  assert.equal(result.warn, true);
  assert.match(result.message, /:pivot/);
});

test('warns when the in-progress phase exceeds its own phase_budget even with time to spare overall', () => {
  const state = stateWith({
    hackathon: { name: 'x', deadline: '2026-09-10T00:00:00Z' },
    budget: { total_hours: 48, spent_hours: 5, phase_budget: { architect: 4 } },
  });
  state.phases.architect = { status: 'in_progress', started_at: '2026-08-30T00:00:00Z' };
  const result = computeDeadlinePressure(state, { now: new Date('2026-08-30T05:00:00Z') }); // 5h in, budget 4h
  assert.equal(result.warn, true);
});

test('silent with no deadline and no budget set at all', () => {
  const result = computeDeadlinePressure(createDefaultState({ pluginVersion: '0.1.0' }), { now: new Date() });
  assert.equal(result.warn, false);
});
