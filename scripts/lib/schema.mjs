import { PHASES } from './paths.mjs';
import { hasExplicitOffset } from './iso-datetime.mjs';

export const CURRENT_SCHEMA_VERSION = 5;

export const REPO_SHAPES = ['next-monolith', 'multi-service'];

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
    budget: { total_hours: null, spent_hours: 0, phase_budget: {}, last_commit: null },
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
    if (h.started_at !== undefined && h.started_at !== null && !hasExplicitOffset(h.started_at)) {
      errors.push('hackathon.started_at must be ISO 8601 with an explicit UTC offset when present');
    }
  }

  if (!['solo', 'team'].includes(state.mode)) {
    errors.push(`mode must be solo or team, got "${state.mode}"`);
  }

  validateProject(state.project, errors);
  validateCompliance(state.compliance, errors);
  validateBudget(state.budget, errors);

  return { valid: errors.length === 0, errors };
}

// Validated for the first time in v4 -- through v3 this was written but never checked,
// the same gap `project` had until v3 (see the comment above validateProject). :check
// both reads and overwrites this shape, so an unvalidated field here is exactly how a
// silent status bug would ship.
function validateCompliance(compliance, errors) {
  if (compliance === null || compliance === undefined) return;
  if (typeof compliance !== 'object' || Array.isArray(compliance)) {
    errors.push('compliance must be an object');
    return;
  }
  const verified = compliance.required_tech_verified;
  if (verified !== undefined && verified !== null) {
    if (typeof verified !== 'object' || Array.isArray(verified)) {
      errors.push('compliance.required_tech_verified must be an object');
    } else {
      for (const [key, value] of Object.entries(verified)) {
        if (key.trim() === '') errors.push('compliance.required_tech_verified has an empty key');
        if (typeof value !== 'boolean') {
          errors.push(`compliance.required_tech_verified["${key}"] must be a boolean`);
        }
      }
    }
  }
  if (compliance.forbidden_tech_found !== undefined) {
    const list = compliance.forbidden_tech_found;
    const isArrayOfStrings = Array.isArray(list) && list.every((x) => typeof x === 'string');
    if (!isArrayOfStrings) errors.push('compliance.forbidden_tech_found must be an array of strings');
  }
}

function validateBudget(budget, errors) {
  if (budget === null || budget === undefined) return;
  if (typeof budget !== 'object' || Array.isArray(budget)) {
    errors.push('budget must be an object');
    return;
  }
  for (const key of ['total_hours', 'spent_hours']) {
    const v = budget[key];
    if (v !== undefined && v !== null && !(typeof v === 'number' && v >= 0)) {
      errors.push(`budget.${key} must be a non-negative number or null`);
    }
  }
  if (budget.phase_budget !== undefined && budget.phase_budget !== null) {
    if (typeof budget.phase_budget !== 'object' || Array.isArray(budget.phase_budget)) {
      errors.push('budget.phase_budget must be an object');
    } else {
      for (const [key, value] of Object.entries(budget.phase_budget)) {
        if (!(typeof value === 'number' && value >= 0)) {
          errors.push(`budget.phase_budget["${key}"] must be a non-negative number`);
        }
      }
    }
  }
  if (budget.last_commit !== undefined && budget.last_commit !== null) {
    const lc = budget.last_commit;
    if (typeof lc !== 'object' || Array.isArray(lc)) {
      errors.push('budget.last_commit must be an object');
    } else {
      if (typeof lc.sha !== 'string' || lc.sha.trim() === '') {
        errors.push('budget.last_commit.sha must be a non-empty string');
      }
      if (!hasExplicitOffset(lc.at)) {
        errors.push('budget.last_commit.at must be ISO 8601 with an explicit UTC offset');
      }
    }
  }
}

// `project` was unvalidated through v2 — it was only ever defaulted to null. M4's
// compliance-checker reads project.stack, and an unvalidated field a later phase
// depends on is how a silent status bug ships.
function validateProject(project, errors) {
  if (project === null || project === undefined) return;   // :describe has not run
  if (typeof project !== 'object' || Array.isArray(project)) {
    errors.push('project must be an object or null');
    return;
  }
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
  if (!nonEmpty(project.name)) errors.push('project.name must be a non-empty string');
  if (!nonEmpty(project.selected_idea)) {
    errors.push('project.selected_idea must be a non-empty string');
  }

  if (project.stack !== undefined && project.stack !== null) {
    if (typeof project.stack !== 'object' || Array.isArray(project.stack)) {
      errors.push('project.stack must be an object');
    } else if (!REPO_SHAPES.includes(project.stack.repo_shape)) {
      errors.push(
        `project.stack.repo_shape "${project.stack.repo_shape}" is not one of ${REPO_SHAPES.join(', ')}`,
      );
    }
  }

  for (const key of ['architecture_ref', 'requirements_ref']) {
    if (project[key] !== undefined && !nonEmpty(project[key])) {
      errors.push(`project.${key} must be a non-empty string when present`);
    }
  }

  if (project.cut_features !== undefined) {
    const isArrayOfStrings = Array.isArray(project.cut_features)
      && project.cut_features.every((x) => typeof x === 'string' && x.trim() !== '');
    if (!isArrayOfStrings) errors.push('project.cut_features must be an array of non-empty strings');
  }

  if (project.deploy !== undefined && project.deploy !== null) {
    const d = project.deploy;
    if (typeof d !== 'object' || Array.isArray(d)) {
      errors.push('project.deploy must be an object');
    } else {
      if (d.primary_url !== undefined && d.primary_url !== null && !nonEmpty(d.primary_url)) {
        errors.push('project.deploy.primary_url must be a non-empty string or null');
      }
      if (d.ref !== undefined && d.ref !== null && !nonEmpty(d.ref)) {
        errors.push('project.deploy.ref must be a non-empty string or null');
      }
    }
  }

  if (project.review !== undefined && project.review !== null) {
    const r = project.review;
    if (typeof r !== 'object' || Array.isArray(r)) {
      errors.push('project.review must be an object');
    } else {
      if (r.clean !== undefined && r.clean !== null && typeof r.clean !== 'boolean') {
        errors.push('project.review.clean must be a boolean or null');
      }
      if (r.ref !== undefined && r.ref !== null && !nonEmpty(r.ref)) {
        errors.push('project.review.ref must be a non-empty string or null');
      }
    }
  }

  if (project.submission !== undefined && project.submission !== null) {
    const s = project.submission;
    if (typeof s !== 'object' || Array.isArray(s)) {
      errors.push('project.submission must be an object');
    } else {
      if (s.requirements_complete !== undefined && typeof s.requirements_complete !== 'boolean') {
        errors.push('project.submission.requirements_complete must be a boolean');
      }
      if (s.ref !== undefined && s.ref !== null && !nonEmpty(s.ref)) {
        errors.push('project.submission.ref must be a non-empty string or null');
      }
    }
  }
}
