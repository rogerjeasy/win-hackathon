/**
 * review.json's shape (docs/design/m5-design.md §3). No `verdict` field is validated or
 * read -- whether a review is clean is always computed from `findings`, never persisted,
 * so a stale or forged verdict can never disagree with the findings that actually decide
 * the gate.
 */
export const REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_SOURCES = ['code-review', 'quality-reviewer'];
export const REVIEW_SEVERITIES = ['blocking', 'should-fix', 'post-hackathon'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

export function validateReview(doc) {
  const errors = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['review must be an object'] };
  }
  if (doc.schema_version !== REVIEW_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${REVIEW_SCHEMA_VERSION}`);
  }
  const findings = Array.isArray(doc.findings) ? doc.findings : null;
  if (findings === null) {
    errors.push('findings must be an array');
    return { valid: errors.length === 0, errors };
  }
  const ids = new Set();
  for (const [i, f] of findings.entries()) validateFinding(f, `findings[${i}]`, ids, errors);
  return { valid: errors.length === 0, errors };
}

function validateFinding(f, at, ids, errors) {
  if (f === null || typeof f !== 'object') {
    errors.push(`${at} must be an object`);
    return;
  }
  if (!isNonEmptyString(f.id)) {
    errors.push(`${at}.id must be a non-empty string`);
  } else if (ids.has(f.id)) {
    errors.push(`${at}.id "${f.id}" is not unique`);
  } else {
    ids.add(f.id);
  }
  if (!REVIEW_SOURCES.includes(f.source)) {
    errors.push(`${at}.source "${f.source}" is not one of ${REVIEW_SOURCES.join(', ')}`);
  }
  if (!REVIEW_SEVERITIES.includes(f.severity)) {
    errors.push(`${at}.severity "${f.severity}" is not one of ${REVIEW_SEVERITIES.join(', ')}`);
  }
  if (!isNonEmptyString(f.title)) errors.push(`${at}.title must be a non-empty string`);
  if (!isNonEmptyString(f.summary)) errors.push(`${at}.summary must be a non-empty string`);
  if (f.file !== null && f.file !== undefined && typeof f.file !== 'string') {
    errors.push(`${at}.file must be a string or null`);
  }
  if (f.line !== null && f.line !== undefined && !(typeof f.line === 'number' && f.line >= 1)) {
    errors.push(`${at}.line must be a positive number or null`);
  }
  if (typeof f.judge_visible !== 'boolean') {
    errors.push(`${at}.judge_visible must be a boolean`);
  }
}

/** Whether-clean is always computed, never stored -- see the module comment above. */
export function isClean(review) {
  return !(review.findings ?? []).some((f) => f.severity === 'blocking');
}

export function blockingFindings(review) {
  return (review.findings ?? []).filter((f) => f.severity === 'blocking');
}
