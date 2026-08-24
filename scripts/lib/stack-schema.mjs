import { REPO_SHAPES } from './schema.mjs';

export const STACK_SCHEMA_VERSION = 1;
export const SOURCES = ['required', 'default', 'bonus', 'replacement'];
export const THESIS_SUPPORT = ['carries', 'supports', 'neutral'];
export { REPO_SHAPES };

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

// recon.tech.required[]/forbidden[] entries carry a human `name` (e.g. "AWS Database"),
// not a stable `id` — the recon extraction step never mints one. requirement_ref needs
// something short and stable to point at, so we derive it deterministically from the
// name (an explicit `.id`, if a future recon shape adds one, wins over the derived slug).
function slugify(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function identifyTech(entry) {
  if (typeof entry === 'string') return { id: slugify(entry), label: entry };
  const id = isNonEmptyString(entry?.id) ? entry.id : slugify(entry?.name);
  const label = entry?.label ?? entry?.name ?? id;
  return { id, label };
}

/**
 * Validate a stack payload. `recon` is optional; when supplied, required and forbidden
 * tech are cross-checked against the real rules. An uncovered mandate is an error, not a
 * warning: shipping without required sponsor tech fails Stage One outright.
 */
export function validateStack(doc, recon) {
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['stack must be an object'], warnings };
  }
  if (doc.schema_version !== STACK_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${STACK_SCHEMA_VERSION}`);
  }
  if (!REPO_SHAPES.includes(doc.repo_shape)) {
    errors.push(`repo_shape "${doc.repo_shape}" is not one of ${REPO_SHAPES.join(', ')}`);
  }
  if (!isNonEmptyString(doc.shape_rationale)) {
    errors.push('shape_rationale must say why this shape, not just which');
  }

  const slots = Array.isArray(doc.slots) ? doc.slots : null;
  if (slots === null) {
    errors.push('slots must be an array');
    return { valid: false, errors, warnings };
  }
  if (slots.length === 0) errors.push('slots must not be empty');

  const seen = new Set();
  for (const [i, slot] of slots.entries()) {
    const at = `slots[${i}]`;
    if (slot === null || typeof slot !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(slot.id)) errors.push(`${at}.id must be a non-empty string`);
    else if (seen.has(slot.id)) errors.push(`${at}.id "${slot.id}" is a duplicate slot`);
    else seen.add(slot.id);

    if (!isNonEmptyString(slot.choice)) errors.push(`${at}.choice must be a non-empty string`);
    if (!SOURCES.includes(slot.source)) {
      errors.push(`${at}.source "${slot.source}" is not one of ${SOURCES.join(', ')}`);
    }
    if (!isNonEmptyString(slot.rationale)) {
      errors.push(`${at}.rationale must say why this choice, not just what it is`);
    }
    if (!THESIS_SUPPORT.includes(slot.thesis_support)) {
      errors.push(`${at}.thesis_support "${slot.thesis_support}" is not one of ${THESIS_SUPPORT.join(', ')}`);
    }
    if (slot.source === 'required' && !isNonEmptyString(slot.requirement_ref)) {
      errors.push(`${at}.requirement_ref is required when source is "required" — it is the trace back into recon.json`);
    }
  }

  // If nothing carries the thesis, strategy.md's win argument has no architecture behind
  // it. sponsor-tech-thesis names exactly this as the failure mode; this makes it mechanical.
  if (slots.length > 0 && !slots.some((s) => s?.thesis_support === 'carries')) {
    errors.push('no slot has thesis_support "carries" — the technology thesis has nothing standing behind it');
  }

  validateBleedingEdge(doc.bleeding_edge, seen, errors, warnings);
  validateRejected(doc.rejected, errors);
  crossCheckRecon(slots, recon, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function validateBleedingEdge(list, slotIds, errors, warnings) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push('bleeding_edge must be an array when present');
    return;
  }
  for (const [i, pin] of list.entries()) {
    const at = `bleeding_edge[${i}]`;
    if (pin === null || typeof pin !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(pin.package)) errors.push(`${at}.package must be a non-empty string`);
    if (!isNonEmptyString(pin.pin)) errors.push(`${at}.pin must be a non-empty string`);
    if (isNonEmptyString(pin.slot) && !slotIds.has(pin.slot)) {
      errors.push(`${at}.slot "${pin.slot}" is not one of the declared slots`);
    }
    if (!isNonEmptyString(pin.docs_path)) {
      warnings.push(`${at}.docs_path is missing — the drift banner will have nowhere to point`);
    }
  }
}

function validateRejected(list, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push('rejected must be an array when present');
    return;
  }
  for (const [i, r] of list.entries()) {
    const at = `rejected[${i}]`;
    if (r === null || typeof r !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(r.choice)) errors.push(`${at}.choice must be a non-empty string`);
    if (!isNonEmptyString(r.why_not)) {
      errors.push(`${at}.why_not must give the reason — a rejected option with no reason is not evidence of a decision`);
    }
  }
}

function crossCheckRecon(slots, recon, errors, warnings) {
  const hasRecon = recon !== undefined && recon !== null;
  const required = Array.isArray(recon?.tech?.required) ? recon.tech.required : null;
  const forbidden = Array.isArray(recon?.tech?.forbidden) ? recon.tech.forbidden : null;

  if (required === null) {
    warnings.push(
      hasRecon
        ? 'recon supplied but tech.required is missing or malformed — mandate coverage was not checked'
        : 'no recon supplied — required and forbidden tech checks were skipped',
    );
    return;
  }

  const covered = new Set(
    slots.filter((s) => s?.source === 'required').map((s) => s?.requirement_ref),
  );
  for (const req of required) {
    const { id, label } = identifyTech(req);
    if (!isNonEmptyString(id)) continue;
    if (!covered.has(id)) {
      errors.push(
        `required tech "${id}" (${label}) is not covered by any slot with source "required" — an uncovered mandate is a Stage One fail`,
      );
    }
  }

  if (forbidden !== null) {
    for (const [i, slot] of slots.entries()) {
      const choice = String(slot?.choice ?? '');
      for (const f of forbidden) {
        const { label: name } = identifyTech(f);
        if (isNonEmptyString(name) && choice.toLowerCase().includes(String(name).toLowerCase())) {
          errors.push(`slots[${i}].choice "${choice}" uses forbidden tech "${name}"`);
        }
      }
    }
  }
}
