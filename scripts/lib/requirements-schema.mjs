export const REQUIREMENTS_SCHEMA_VERSION = 1;
export const PRIORITIES = ['must', 'should', 'wont'];
export const FR_ID_RE = /^FR-\d+\.\d+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isNonEmptyStringArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

export function validateRequirements(doc, options = {}) {
  // `options` may arrive as `null` (a caller forwarding an absent optional payload literally
  // as null rather than omitting it) — `= {}` only fires on `undefined`, so guard here too.
  const { recon, architecture } = options ?? {};
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['requirements must be an object'], warnings };
  }
  if (doc.schema_version !== REQUIREMENTS_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${REQUIREMENTS_SCHEMA_VERSION}`);
  }

  const features = Array.isArray(doc.features) ? doc.features : null;
  if (features === null || features.length === 0) {
    errors.push('features must be a non-empty array');
    return { valid: false, errors, warnings };
  }

  const frIds = new Set();
  const slugs = new Set();
  const scenarioIds = new Set();
  for (const [i, f] of features.entries()) {
    validateFeature(f, `features[${i}]`, frIds, slugs, scenarioIds, errors);
  }

  validateNonFunctional(doc.non_functional, errors);
  crossCheckRecon(features, recon, errors, warnings);
  crossCheckArchitecture(features, architecture, errors, warnings);

  if (!features.some((f) => f?.demo_moment === true)) {
    warnings.push('no feature is flagged demo_moment — strategy.md names a demo moment; one feature should own it');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateFeature(f, at, frIds, slugs, scenarioIds, errors) {
  if (f === null || typeof f !== 'object') {
    errors.push(`${at} must be an object`);
    return;
  }
  if (!isNonEmptyString(f.id)) errors.push(`${at}.id must be a non-empty string`);
  if (!isNonEmptyString(f.title)) errors.push(`${at}.title must be a non-empty string`);
  if (!PRIORITIES.includes(f.priority)) {
    errors.push(`${at}.priority "${f.priority}" is not one of ${PRIORITIES.join(', ')}`);
  }

  // The slug becomes features/<slug>.feature, specs/NNNN-<slug>/ and openspec/changes/<slug>/.
  if (!isNonEmptyString(f.slug) || !SLUG_RE.test(f.slug)) {
    errors.push(`${at}.slug "${f.slug}" must be lower-kebab-case — it becomes a filename in three places`);
  } else if (slugs.has(f.slug)) {
    errors.push(`${at}.slug "${f.slug}" is a duplicate`);
  } else {
    slugs.add(f.slug);
  }

  const story = f.user_story;
  if (story === null || typeof story !== 'object') {
    errors.push(`${at}.user_story must be an object with as_a, i_want and so_that`);
  } else {
    for (const k of ['as_a', 'i_want', 'so_that']) {
      if (!isNonEmptyString(story[k])) errors.push(`${at}.user_story.${k} must be a non-empty string`);
    }
  }

  const own = new Set();
  const reqs = Array.isArray(f.requirements) ? f.requirements : [];
  if (reqs.length === 0) errors.push(`${at}.requirements must be a non-empty array`);
  for (const [j, r] of reqs.entries()) {
    const rat = `${at}.requirements[${j}]`;
    if (r === null || typeof r !== 'object') {
      errors.push(`${rat} must be an object`);
      continue;
    }
    if (!FR_ID_RE.test(r.id ?? '')) {
      errors.push(`${rat}.id "${r.id}" must match FR-<n>.<n>`);
    } else {
      // A duplicate id is still an error, but this feature still declares it — record it in
      // `own` regardless, so this feature's own scenarios aren't *also* flagged as pointing
      // at an FR the feature doesn't declare. That second error would be true only by
      // coincidence of bookkeeping order and would mislead whoever reads it.
      if (frIds.has(r.id)) errors.push(`${rat}.id "${r.id}" is a duplicate FR id`);
      frIds.add(r.id);
      own.add(r.id);
    }
    if (!isNonEmptyString(r.statement)) errors.push(`${rat}.statement must be a non-empty string`);
  }

  const scenarios = Array.isArray(f.scenarios) ? f.scenarios : [];
  if (f.priority === 'must' && scenarios.length === 0) {
    errors.push(`${at} is a must-have with no scenario — every must-have needs at least one`);
  }
  for (const [j, s] of scenarios.entries()) {
    const sat = `${at}.scenarios[${j}]`;
    if (s === null || typeof s !== 'object') {
      errors.push(`${sat} must be an object`);
      continue;
    }
    // Scenario identity is one level down from feature slug: Task 19 renders scenarios into
    // .feature files and Task 21 emits the EARS triad, both keyed on scenario id. A doc with
    // a missing or duplicate scenario id validates clean here and breaks downstream.
    if (!isNonEmptyString(s.id)) {
      errors.push(`${sat}.id must be a non-empty string`);
    } else if (scenarioIds.has(s.id)) {
      errors.push(`${sat}.id "${s.id}" is a duplicate scenario id`);
    } else {
      scenarioIds.add(s.id);
    }
    if (!isNonEmptyString(s.name)) errors.push(`${sat}.name must be a non-empty string`);
    if (!own.has(s.requirement_ref)) {
      errors.push(`${sat}.requirement_ref "${s.requirement_ref}" is not an FR declared by this feature`);
    }
    for (const k of ['given', 'when', 'then']) {
      if (!isNonEmptyStringArray(s[k])) {
        errors.push(`${sat}.${k} must be a non-empty array of strings`);
      }
    }
  }
}

function validateNonFunctional(list, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push('non_functional must be an array when present');
    return;
  }
  for (const [i, n] of list.entries()) {
    const at = `non_functional[${i}]`;
    if (n === null || typeof n !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(n.id)) errors.push(`${at}.id must be a non-empty string`);
    if (!isNonEmptyString(n.statement)) errors.push(`${at}.statement must be a non-empty string`);
    if (!isNonEmptyString(n.verify)) {
      errors.push(`${at}.verify must say how this is checked — an unverifiable NFR is a wish`);
    }
  }
}

function crossCheckRecon(features, recon, errors, warnings) {
  const items = Array.isArray(recon?.criteria?.items) ? recon.criteria.items : null;
  if (items === null) {
    warnings.push(
      recon
        ? 'recon supplied but criteria.items is missing or malformed — rubric coverage was not checked'
        : 'no recon supplied — rubric coverage was not checked',
    );
    return;
  }

  const rubric = items.map((i) => i?.id).filter(isNonEmptyString);
  const claimedBy = new Map(rubric.map((id) => [id, []]));

  for (const [i, f] of features.entries()) {
    const refs = Array.isArray(f?.criterion_refs) ? f.criterion_refs : [];
    for (const ref of refs) {
      if (!claimedBy.has(ref)) {
        errors.push(`features[${i}].criterion_refs "${ref}" is not in the rubric (${rubric.join(', ')})`);
        continue;
      }
      claimedBy.get(ref).push(f.priority);
    }
  }

  // Both directions. A criterion nothing is built for is a guaranteed zero on a weighted axis.
  for (const [id, priorities] of claimedBy) {
    if (priorities.length === 0) {
      errors.push(`judging criterion "${id}" is not claimed by any feature — it will score zero`);
    } else if (!priorities.includes('must')) {
      warnings.push(`judging criterion "${id}" is claimed only by non-must features — it may not get built`);
    }
  }
}

function crossCheckArchitecture(features, architecture, errors, warnings) {
  const components = Array.isArray(architecture?.components) ? architecture.components : null;
  if (components === null) {
    warnings.push(
      architecture
        ? 'architecture supplied but components is missing or malformed — component_refs were not checked'
        : 'no architecture supplied — component_refs and invariant_refs were not checked',
    );
    return;
  }

  const componentIds = new Set(components.map((c) => c?.id));

  // Every list read from the untrusted `architecture` or `features` payloads is guarded with
  // `Array.isArray(x) ? x : ...` before iterating — a bare `?? []` on a value that is present
  // but the wrong type (a string, a number, a plain object) does not fall through to the
  // default and throws when iterated. `validateIdeas` was fixed for exactly this bug; every
  // sibling cross-check guards this way (see crossCheckStack in architecture-schema.mjs) and
  // this function must too.
  const invariants = Array.isArray(architecture.invariants) ? architecture.invariants : null;
  if (invariants === null) {
    // Consistent with the components-absent branch above: an architecture that simply
    // doesn't carry invariants yet degrades to "not checked", not to every invariant_ref
    // being a hard error against an empty set.
    warnings.push('architecture supplied but invariants is missing or malformed — invariant_refs were not checked');
  }
  const invariantIds = invariants === null ? null : new Set(invariants.map((i) => i?.id));

  for (const [i, f] of features.entries()) {
    const componentRefs = Array.isArray(f?.component_refs) ? f.component_refs : [];
    for (const ref of componentRefs) {
      if (!componentIds.has(ref)) {
        errors.push(`features[${i}].component_refs "${ref}" is not a component in architecture.json`);
      }
    }
    const requirements = Array.isArray(f?.requirements) ? f.requirements : [];
    for (const [j, r] of requirements.entries()) {
      if (invariantIds === null) continue;
      const invariantRefs = Array.isArray(r?.invariant_refs) ? r.invariant_refs : [];
      for (const ref of invariantRefs) {
        if (!invariantIds.has(ref)) {
          errors.push(`features[${i}].requirements[${j}].invariant_refs "${ref}" is not an invariant in architecture.json`);
        }
      }
    }
  }
}
