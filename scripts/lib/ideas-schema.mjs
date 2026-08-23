export const IDEAS_SCHEMA_VERSION = 1;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Validate a scoring payload. `recon` is optional; when supplied, criterion ids and the
 * score ceiling are cross-checked against the real rubric.
 */
export function validateIdeas(doc, recon) {
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['ideas must be an object'], warnings };
  }
  if (doc.schema_version !== IDEAS_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${IDEAS_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(doc.round) || doc.round < 1) {
    errors.push(`round must be a positive integer, got ${doc.round}`);
  }

  const scored = Array.isArray(doc.ideas) ? doc.ideas : null;
  const rejected = Array.isArray(doc.disqualified) ? doc.disqualified : null;
  if (scored === null) errors.push('ideas must be an array (empty is allowed)');
  if (rejected === null) errors.push('disqualified must be an array (empty is allowed)');
  if (scored === null || rejected === null) return { valid: false, errors, warnings };

  const hasRecon = recon !== undefined && recon !== null;
  const rawItems = recon?.criteria?.items;
  const rubricIds = Array.isArray(rawItems)
    ? rawItems.filter((i) => isNonEmptyString(i?.id)).map((i) => i.id)
    : [];
  const rawMaxScore = recon?.criteria?.max_base_score;
  const maxScore = Number.isFinite(rawMaxScore) ? rawMaxScore : undefined;

  // Rubric-membership and score-ceiling checks have independent failure causes — an
  // absent recon skips both, but a malformed recon can supply one without the other
  // (e.g. `criteria.items` present, `max_base_score` missing). Warn on each separately,
  // and say plainly whether recon was supplied at all or merely malformed, so a caller
  // debugging a bad recon integration is told the truth about what happened.
  if (rubricIds.length === 0) {
    warnings.push(
      hasRecon
        ? 'recon supplied but criteria.items is empty or malformed — rubric-membership checks were skipped'
        : 'no recon supplied — rubric-membership checks were skipped',
    );
  }
  if (typeof maxScore !== 'number') {
    warnings.push(
      hasRecon
        ? 'recon supplied but criteria.max_base_score is missing or not a number — score-ceiling checks were skipped'
        : 'no recon supplied — score-ceiling checks were skipped',
    );
  }

  const seenIds = new Set();
  const claimId = (id, where) => {
    if (!isNonEmptyString(id)) { errors.push(`${where}.id must be a non-empty string`); return; }
    if (seenIds.has(id)) errors.push(`${where} has a duplicate id "${id}"`);
    seenIds.add(id);
  };

  for (const [i, idea] of scored.entries()) {
    const where = `ideas[${i}]${idea?.id ? ` (${idea.id})` : ''}`;
    claimId(idea?.id, where);
    if (!isNonEmptyString(idea?.name)) errors.push(`${where}.name must be a non-empty string`);
    if (!isNonEmptyString(idea?.pitch)) errors.push(`${where}.pitch must be a non-empty string`);

    // The gate runs before scoring. Anything here passed it, by definition.
    if (idea?.stage_one?.pass !== true) {
      errors.push(`${where} failed the Stage-One gate and belongs in disqualified, not ideas`);
    }

    // The three tests every winning submission in the corpus passes.
    if (!isNonEmptyString(idea?.thesis)) {
      errors.push(`${where}.thesis must state why this technology, in one line a competitor could not claim`);
    }
    if (!isNonEmptyString(idea?.inversion)) {
      errors.push(`${where}.inversion must state the idea as "X, not Y" in one sentence`);
    }
    if (!isNonEmptyString(idea?.demo_moment)) {
      errors.push(`${where}.demo_moment must name the one thing a judge sees in under three minutes`);
    }
    if (!isNonEmptyString(idea?.track?.id)) {
      errors.push(`${where}.track.id must name the track this idea is entered in`);
    }
    if (idea?.feasibility_hours != null && typeof idea.feasibility_hours !== 'number') {
      errors.push(`${where}.feasibility_hours must be a number when present`);
    }

    validateScores(idea, where, rubricIds, maxScore, errors);
  }

  for (const [i, idea] of rejected.entries()) {
    const where = `disqualified[${i}]${idea?.id ? ` (${idea.id})` : ''}`;
    claimId(idea?.id, where);
    if (!isNonEmptyString(idea?.name)) errors.push(`${where}.name must be a non-empty string`);
    if (idea?.stage_one?.pass !== false) {
      errors.push(`${where} is in disqualified and must record stage_one.pass = false`);
    }
    if (!Array.isArray(idea?.stage_one?.reasons) || idea.stage_one.reasons.length === 0) {
      errors.push(`${where} must give at least one reason for the disqualification`);
    }
    if (idea?.scores !== undefined) {
      errors.push(
        `${where} must not carry scores — a disqualified idea is never scored, because a `
        + 'number invites falling in love with an idea that cannot win',
      );
    }
  }

  const ranks = scored.map((i) => i?.rank).sort((a, b) => a - b);
  if (!ranks.every((r, i) => r === i + 1)) {
    errors.push(`ideas ranks must be contiguous 1..${scored.length}, got ${ranks.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateScores(idea, where, rubricIds, maxScore, errors) {
  const scores = idea?.scores;
  if (!Array.isArray(scores) || scores.length === 0) {
    errors.push(`${where}.scores must be a non-empty array`);
    return;
  }

  const seen = new Set();
  for (const [j, s] of scores.entries()) {
    const at = `${where}.scores[${j}]`;
    if (!isNonEmptyString(s?.criterion_id)) {
      errors.push(`${at}.criterion_id must be a non-empty string`);
      continue;
    }
    if (seen.has(s.criterion_id)) {
      errors.push(`${at} is a duplicate score for criterion "${s.criterion_id}"`);
    }
    seen.add(s.criterion_id);

    if (rubricIds.length > 0 && !rubricIds.includes(s.criterion_id)) {
      errors.push(`${at}.criterion_id "${s.criterion_id}" is not in the rubric (${rubricIds.join(', ')})`);
    }
    if (typeof s.score !== 'number' || Number.isNaN(s.score)) {
      errors.push(`${at}.score must be a number, got "${s.score}"`);
    } else if (typeof maxScore === 'number' && (s.score < 0 || s.score > maxScore)) {
      errors.push(`${at}.score ${s.score} is out of range 0..${maxScore} (max_base_score)`);
    }
    if (!isNonEmptyString(s?.rationale)) {
      errors.push(`${at}.rationale must say why, not just how much`);
    }
  }

  if (rubricIds.length > 0) {
    const missing = rubricIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      errors.push(`${where} must score every criterion in the rubric; missing: ${missing.join(', ')}`);
    }
  }
}
