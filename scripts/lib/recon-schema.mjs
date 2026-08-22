import { hasExplicitOffset } from './iso-datetime.mjs';

export const RECON_SCHEMA_VERSION = 1;
export const DATE_KINDS = ['hard', 'action', 'informational'];
export const TIEBREAKS = ['listed_order', 'judge_vote', 'unspecified'];
export const WEIGHTINGS = ['equal', 'weighted'];

const WEIGHT_TOLERANCE = 0.001;

const KNOWN_TOP_LEVEL = new Set([
  'schema_version', 'source', 'identity', 'dates', 'stage_one', 'criteria', 'bonus',
  'tech', 'tracks', 'open_prizes', 'prize_rules', 'landscape', 'judges', 'panel_read',
  'submission_requirements', 'submission_form', 'eligibility', 'constraints',
  'host_guidance', 'ambiguities', 'unresolved',
]);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Validate a recon extraction. Returns every problem at once — an agent retrying an
 * extraction needs the whole list, not one error per round trip.
 */
export function validateRecon(recon) {
  const errors = [];
  const warnings = [];

  if (recon === null || typeof recon !== 'object' || Array.isArray(recon)) {
    return { valid: false, errors: ['recon must be an object'], warnings };
  }

  if (recon.schema_version !== RECON_SCHEMA_VERSION) {
    errors.push(
      `schema_version ${recon.schema_version} != supported ${RECON_SCHEMA_VERSION}`,
    );
  }

  for (const key of Object.keys(recon)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warnings.push(`unknown top-level key "${key}" (kept, not validated)`);
    }
  }

  if (!isNonEmptyString(recon.identity?.name)) {
    errors.push('identity.name must be a non-empty string');
  }

  validateDates(recon.dates, errors);
  validateCriteria(recon.criteria, errors);
  validateSubmissionRequirements(recon.submission_requirements, errors);
  validateLandscape(recon.landscape, errors);

  if (!Array.isArray(recon.tech?.required)) {
    errors.push('tech.required must be an array (empty is allowed; missing is not)');
  }
  if (recon.unresolved !== undefined && !Array.isArray(recon.unresolved)) {
    errors.push('unresolved must be an array');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDates(dates, errors) {
  if (!Array.isArray(dates) || dates.length === 0) {
    errors.push('dates must be a non-empty array');
    return;
  }
  let hard = 0;
  for (const [i, d] of dates.entries()) {
    const where = `dates[${i}]${d?.label ? ` (${d.label})` : ''}`;
    if (!isNonEmptyString(d?.label)) errors.push(`${where}.label must be a non-empty string`);
    if (!hasExplicitOffset(d?.at)) {
      errors.push(`${where}.at must be ISO 8601 with an explicit UTC offset, got "${d?.at}"`);
    }
    if (!DATE_KINDS.includes(d?.kind)) {
      errors.push(`${where}.kind must be one of ${DATE_KINDS.join(', ')}, got "${d?.kind}"`);
    }
    if (d?.kind === 'hard') hard += 1;
  }
  if (hard !== 1) {
    errors.push(`dates must contain exactly one "hard" date (the submission deadline), found ${hard}`);
  }
}

function validateCriteria(criteria, errors) {
  if (!criteria || typeof criteria !== 'object') {
    errors.push('criteria missing');
    return;
  }
  if (!WEIGHTINGS.includes(criteria.weighting)) {
    errors.push(`criteria.weighting must be one of ${WEIGHTINGS.join(', ')}, got "${criteria.weighting}"`);
  }
  if (!TIEBREAKS.includes(criteria.tiebreak)) {
    errors.push(`criteria.tiebreak must be one of ${TIEBREAKS.join(', ')}, got "${criteria.tiebreak}"`);
  }

  const items = criteria.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('criteria.items must contain at least one criterion');
    return;
  }

  const seen = new Set();
  for (const [i, item] of items.entries()) {
    const where = `criteria.items[${i}]${item?.id ? ` (${item.id})` : ''}`;
    if (!isNonEmptyString(item?.id)) errors.push(`${where}.id must be a non-empty string`);
    if (!isNonEmptyString(item?.name)) errors.push(`${where}.name must be a non-empty string`);
    // A criterion without the host's own words cannot be scored against honestly.
    if (!isNonEmptyString(item?.quote)) errors.push(`${where}.quote must be a non-empty string`);
    if (isNonEmptyString(item?.id)) {
      if (seen.has(item.id)) errors.push(`${where} has a duplicate id "${item.id}"`);
      seen.add(item.id);
    }
    if (item?.evidence_slots !== undefined && !Array.isArray(item.evidence_slots)) {
      errors.push(`${where}.evidence_slots must be an array`);
    }
  }

  // rank is load-bearing: it is the tiebreak order, so rank 1 outweighs its nominal weight.
  const ranks = items.map((i) => i?.rank).sort((a, b) => a - b);
  const contiguous = ranks.every((r, i) => r === i + 1);
  if (!contiguous) {
    errors.push(`criteria.items ranks must be contiguous 1..${items.length}, got ${ranks.join(', ')}`);
  }

  // Weights are only trusted when the host actually weighted them. Under "equal"
  // weighting they are derived, so whatever the agent guessed is ignored.
  if (criteria.weighting === 'weighted') {
    const sum = items.reduce((acc, i) => acc + (typeof i?.weight === 'number' ? i.weight : NaN), 0);
    if (Number.isNaN(sum) || Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
      errors.push(`weighted criteria.items weights must sum to 1.0 ± ${WEIGHT_TOLERANCE}, got ${sum}`);
    }
  }
}

function validateSubmissionRequirements(reqs, errors) {
  if (!Array.isArray(reqs)) {
    errors.push('submission_requirements must be an array');
    return;
  }
  for (const [i, r] of reqs.entries()) {
    const where = `submission_requirements[${i}]${r?.id ? ` (${r.id})` : ''}`;
    if (!isNonEmptyString(r?.id)) errors.push(`${where}.id must be a non-empty string`);
    if (!isNonEmptyString(r?.requirement)) errors.push(`${where}.requirement must be a non-empty string`);
    // Hard requirements are the disqualifiers. Each one must be citable.
    if (r?.hard === true && !isNonEmptyString(r?.quote)) {
      errors.push(`${where} is hard:true and must carry a verbatim quote`);
    }
  }
}

function validateLandscape(landscape, errors) {
  if (landscape === undefined) return;
  if (!landscape || typeof landscape !== 'object') {
    errors.push('landscape must be an object when present');
    return;
  }
  // Devpost galleries stay empty until winners are announced. A crowding number during a
  // live hackathon is therefore invented, and inventing one is exactly what recon must not do.
  if (landscape.gallery_available !== true && landscape.entries_observed != null) {
    errors.push(
      'landscape.entries_observed must be null unless landscape.gallery_available is true — '
      + 'project galleries are empty until winners are announced',
    );
  }
  if (landscape.per_track !== undefined && !Array.isArray(landscape.per_track)) {
    errors.push('landscape.per_track must be an array');
  }
  if (landscape.prior_editions !== undefined && !Array.isArray(landscape.prior_editions)) {
    errors.push('landscape.prior_editions must be an array');
  }
}
