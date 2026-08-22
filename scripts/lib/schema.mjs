import { PHASES } from './paths.mjs';
import { hasExplicitOffset } from './iso-datetime.mjs';

export const CURRENT_SCHEMA_VERSION = 2;

export const PHASE_STATUSES = [
  'not_started', 'in_progress', 'awaiting_approval', 'approved', 'skipped',
];

export const DELIVERABLE_STATUSES = ['not_started', 'in_progress', 'done', 'skipped'];

const TIEBREAKS = ['listed_order', 'judge_vote', 'unspecified'];

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
    deliverables: { submission_requirements: [], bonus_content: [] },
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

  // deliverables — seeded by :recon and :describe, delivered at :submit
  if (!state.deliverables || typeof state.deliverables !== 'object') {
    errors.push('deliverables missing');
  } else {
    for (const key of ['submission_requirements', 'bonus_content']) {
      const list = state.deliverables[key];
      if (!Array.isArray(list)) {
        errors.push(`deliverables.${key} must be an array`);
        continue; // not iterable in general — the array-type error above already covers it
      }
      for (const item of list) {
        if (typeof item?.id !== 'string' || item.id === '') {
          errors.push(`deliverables.${key}[].id must be a non-empty string`);
        }
        if (!DELIVERABLE_STATUSES.includes(item?.status)) {
          errors.push(`deliverables.${key}[${item?.id}] has invalid status "${item?.status}"`);
        }
      }
    }
  }

  // hackathon is null until :recon runs. Once populated it is a digest assembled by
  // buildHackathonDigest from an already-validated recon.json, so this layer checks only
  // what is present rather than re-running recon-schema's guarantees. In particular it does
  // NOT offset-check `deadline`: that guard belongs in recon-schema.mjs, where agent-authored
  // dates actually enter the system, and duplicating it here would make it impossible to
  // persist the malformed states the SessionStart hook's regression tests need.
  if (state.hackathon !== null && state.hackathon !== undefined) {
    const h = state.hackathon;
    if (typeof h.name !== 'string' || h.name === '') {
      errors.push('hackathon.name must be a non-empty string');
    }
    if (h.url !== undefined && typeof h.url !== 'string') {
      errors.push('hackathon.url must be a string when present');
    }
    if (h.next_action_deadline != null && !hasExplicitOffset(h.next_action_deadline.at)) {
      errors.push('hackathon.next_action_deadline.at must be ISO 8601 with an explicit UTC offset');
    }
    if (h.criteria_ids !== undefined && !Array.isArray(h.criteria_ids)) {
      errors.push('hackathon.criteria_ids must be an array when present');
    }
    if (h.tiebreak !== undefined && !TIEBREAKS.includes(h.tiebreak)) {
      errors.push(`hackathon.tiebreak must be one of ${TIEBREAKS.join(', ')}, got "${h.tiebreak}"`);
    }
  }

  if (!['solo', 'team'].includes(state.mode)) {
    errors.push(`mode must be solo or team, got "${state.mode}"`);
  }
  return { valid: errors.length === 0, errors };
}
