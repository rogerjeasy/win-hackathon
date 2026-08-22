import { PHASES } from './paths.mjs';

export const CURRENT_SCHEMA_VERSION = 1;

export const PHASE_STATUSES = [
  'not_started', 'in_progress', 'awaiting_approval', 'approved', 'skipped',
];

export function createDefaultState({ pluginVersion }) {
  const phases = {};
  for (const p of PHASES) phases[p] = { status: 'not_started' };
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    plugin_version: pluginVersion,
    hackathon: null,
    project: null,
    phases,
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

export function validateState(state) {
  const errors = [];
  if (state === null || typeof state !== 'object') {
    return { valid: false, errors: ['state must be an object'] };
  }
  if (state.schema_version !== CURRENT_SCHEMA_VERSION) {
    errors.push(
      `schema_version ${state.schema_version} != supported ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (!state.phases || typeof state.phases !== 'object') {
    errors.push('phases missing');
    return { valid: false, errors };
  }
  for (const name of Object.keys(state.phases)) {
    if (!PHASES.includes(name)) errors.push(`unknown phase "${name}"`);
  }
  for (const name of PHASES) {
    const phase = state.phases[name];
    if (!phase) { errors.push(`phase "${name}" missing`); continue; }
    if (!PHASE_STATUSES.includes(phase.status)) {
      errors.push(`phase "${name}" has invalid status "${phase.status}"`);
    }
    if (phase.artifacts !== undefined) {
      const isArrayOfStrings = Array.isArray(phase.artifacts)
        && phase.artifacts.every((a) => typeof a === 'string');
      if (!isArrayOfStrings) {
        errors.push(`phase "${name}" has invalid artifacts (must be an array of strings)`);
      }
    }
  }
  if (!['solo', 'team'].includes(state.mode)) {
    errors.push(`mode must be solo or team, got "${state.mode}"`);
  }
  return { valid: errors.length === 0, errors };
}
