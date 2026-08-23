import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * A literal, frozen snapshot of the state.json that the M1 plugin wrote: schema_version
 * 1, no `deliverables` block. It is deliberately NOT derived from createDefaultState() —
 * a fixture that tracks the current schema stops being a v1 file the moment the schema
 * moves, and testing migration against a state the current code already accepts proves
 * nothing.
 */
export function v1State() {
  const phases = {};
  for (const p of [
    'recon', 'brainstorm', 'describe', 'stack', 'architect',
    'requirements', 'spec', 'build', 'ship', 'review', 'submit',
  ]) phases[p] = { status: 'not_started' };

  return {
    schema_version: 1,
    plugin_version: '0.1.0',
    hackathon: null,
    project: null,
    phases,
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

/** Write a real v1 state.json into `root`, bypassing writeState (which would reject it). */
export async function writeV1State(root, mutate) {
  const state = v1State();
  if (mutate) mutate(state);
  await mkdir(path.join(root, '.hackathon'), { recursive: true });
  await writeFile(
    path.join(root, '.hackathon', 'state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
  return state;
}
