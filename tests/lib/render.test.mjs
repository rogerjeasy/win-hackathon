import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { renderStatusBoard, renderInitPlan } from '../../scripts/lib/render.mjs';

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
