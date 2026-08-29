export const ARCHITECTURE_SCHEMA_VERSION = 1;
export const TRUST_ZONES = ['public', 'authenticated', 'privileged', 'external'];
export const ACCESS_MODELS = ['rls', 'app-layer', 'none'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

export function validateArchitecture(doc, stack) {
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['architecture must be an object'], warnings };
  }
  if (doc.schema_version !== ARCHITECTURE_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${ARCHITECTURE_SCHEMA_VERSION}`);
  }
  if (!isNonEmptyString(doc.thesis_line)) {
    errors.push('thesis_line must state, in one line, what a competitor using something else could not claim');
  }

  const components = Array.isArray(doc.components) ? doc.components : null;
  if (components === null || components.length === 0) {
    errors.push('components must be a non-empty array');
    return { valid: false, errors, warnings };
  }

  const ids = validateComponents(components, errors);
  validateTiers(components, errors);
  validateEdges(doc.edges, ids, errors);
  validateBoundaries(doc.trust_boundaries, ids, errors);
  validateEntities(doc.entities, errors);
  validateAccessControl(doc.access_control, doc.entities ?? [], errors);
  validateInvariants(doc.invariants, errors);
  validateFlows(doc.flows, errors);
  validateDesignSystem(doc.design_system, warnings);
  crossCheckStack(components, stack, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function validateComponents(components, errors) {
  const ids = new Set();
  for (const [i, c] of components.entries()) {
    const at = `components[${i}]`;
    if (c === null || typeof c !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(c.id)) errors.push(`${at}.id must be a non-empty string`);
    else if (ids.has(c.id)) errors.push(`${at}.id "${c.id}" is a duplicate component id`);
    else ids.add(c.id);

    if (!isNonEmptyString(c.label)) errors.push(`${at}.label must be a non-empty string`);

    // The three-field legend is the design-scoring device: it turns a parts list into a
    // record of decisions. All three are required, and "why_this_choice" most of all.
    for (const field of ['what_it_is', 'what_it_does', 'why_this_choice']) {
      if (!isNonEmptyString(c[field])) errors.push(`${at}.${field} must be a non-empty string`);
    }
    if (!TRUST_ZONES.includes(c.trust_zone)) {
      errors.push(`${at}.trust_zone "${c.trust_zone}" is not one of ${TRUST_ZONES.join(', ')}`);
    }
  }
  return ids;
}

function validateTiers(components, errors) {
  const tiers = new Set();
  for (const [i, c] of components.entries()) {
    const t = c?.tier;
    if (!Number.isInteger(t) || t < 1) {
      errors.push(`components[${i}].tier must be an integer >= 1, got ${t}`);
      continue;
    }
    tiers.add(t);
  }
  if (tiers.size === 0) return;
  const sorted = [...tiers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i + 1) {
      errors.push(
        `tiers must run 1..n with no gap; found ${sorted.join(', ')} — the layout renders one row per tier, so a gap renders an empty band`,
      );
      break;
    }
  }
}

function validateEdges(edges, ids, errors) {
  if (edges === undefined) return;
  if (!Array.isArray(edges)) {
    errors.push('edges must be an array when present');
    return;
  }
  for (const [i, e] of edges.entries()) {
    const at = `edges[${i}]`;
    if (e === null || typeof e !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    for (const end of ['from', 'to']) {
      if (!isNonEmptyString(e[end])) errors.push(`${at}.${end} must be a component id`);
      else if (!ids.has(e[end])) errors.push(`${at}.${end} "${e[end]}" is not a declared component`);
    }
  }
}

function validateBoundaries(boundaries, ids, errors) {
  if (boundaries === undefined) return;
  if (!Array.isArray(boundaries)) {
    errors.push('trust_boundaries must be an array when present');
    return;
  }
  // A component id claimed by two boundaries' `contains` renders into only the later
  // subgraph. Correction (review round 1, M1): the earlier comment/commit blamed
  // layout.mjs for this, but layout.mjs's `boundaries` is a plain array — each boundary
  // computes its own bounding rect independently, so a double claim there would just draw
  // two overlapping rects, not drop a node. The actual mechanism is emit-mermaid.mjs's
  // `for (const id of b.contains) inBoundary.set(id, b.id)`: a later boundary's claim
  // overwrites an earlier one's entry for the same id, so when the earlier boundary's
  // subgraph is emitted, `inBoundary.get(box.id) !== b.id` is now true and the box is
  // skipped from it — it only ever renders inside the later boundary's subgraph. Track
  // first-claimant here so a second claim is an error, not a vanished node in the diagram.
  const claimedBy = new Map(); // component id -> index of the boundary that first named it
  for (const [i, b] of boundaries.entries()) {
    const at = `trust_boundaries[${i}]`;
    if (b === null || typeof b !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(b.id)) errors.push(`${at}.id must be a non-empty string`);
    if (!isNonEmptyString(b.label)) errors.push(`${at}.label must be a non-empty string`);
    if (!Array.isArray(b.contains) || b.contains.length === 0) {
      errors.push(`${at}.contains must be a non-empty array of component ids`);
      continue;
    }
    for (const id of b.contains) {
      if (!ids.has(id)) {
        errors.push(`${at}.contains names "${id}", which is not a declared component`);
        continue;
      }
      if (claimedBy.has(id)) {
        const firstIndex = claimedBy.get(id);
        // M2 (review round 1): claimedBy.get(id) === i is the same boundary repeating an
        // id in its own `contains` array, not a cross-boundary claim -- word it as such,
        // rather than the confusing "already in trust_boundaries[0].contains" when i is 0.
        errors.push(firstIndex === i
          ? `${at}.contains lists "${id}" more than once`
          : `${at}.contains names "${id}", which is already in trust_boundaries[${firstIndex}].contains — a component may appear in at most one trust boundary`);
      } else {
        claimedBy.set(id, i);
      }
    }
  }
}

function validateEntities(entities, errors) {
  const names = new Set();
  if (entities === undefined) return names;
  if (!Array.isArray(entities)) {
    errors.push('entities must be an array when present');
    return names;
  }
  for (const [i, e] of entities.entries()) {
    const at = `entities[${i}]`;
    if (e === null || typeof e !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(e.name)) errors.push(`${at}.name must be a non-empty string`);
    else if (names.has(e.name)) errors.push(`${at}.name "${e.name}" is a duplicate entity`);
    else names.add(e.name);

    if (!isNonEmptyString(e.purpose)) errors.push(`${at}.purpose must say what this entity is for`);
    if (typeof e.tenant_scoped !== 'boolean') {
      errors.push(`${at}.tenant_scoped must be a boolean — it decides whether a policy is required`);
    }
    validateEntityFields(e.fields, at, errors);
  }

  // Second pass: a relationship may point at an entity declared later in the array, so
  // targets are checked only once every name in this payload is known. Without this, a
  // typo in `to` renders a phantom box in the judge-facing ERD with no catalog row.
  for (const [i, e] of entities.entries()) {
    if (e === null || typeof e !== 'object') continue;
    const rels = e.relationships;
    if (rels === undefined) continue;
    if (!Array.isArray(rels)) {
      errors.push(`entities[${i}].relationships must be an array when present`);
      continue;
    }
    for (const [j, r] of rels.entries()) {
      const at = `entities[${i}].relationships[${j}]`;
      if (r === null || typeof r !== 'object') {
        errors.push(`${at} must be an object`);
        continue;
      }
      if (!isNonEmptyString(r.to)) errors.push(`${at}.to must be a non-empty string`);
      else if (!names.has(r.to)) errors.push(`${at}.to "${r.to}" is not a declared entity`);
    }
  }
  return names;
}

function validateEntityFields(fields, at, errors) {
  if (fields === undefined) return;
  if (!Array.isArray(fields)) {
    errors.push(`${at}.fields must be an array when present`);
    return;
  }
  for (const [j, f] of fields.entries()) {
    const fat = `${at}.fields[${j}]`;
    if (f === null || typeof f !== 'object') {
      errors.push(`${fat} must be an object`);
      continue;
    }
    if (!isNonEmptyString(f.name)) errors.push(`${fat}.name must be a non-empty string`);
  }
}

function validateFlows(flows, errors) {
  if (flows === undefined) return;
  if (!Array.isArray(flows)) {
    errors.push('flows must be an array when present');
    return;
  }
  for (const [i, f] of flows.entries()) {
    const at = `flows[${i}]`;
    if (f === null || typeof f !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(f.title)) errors.push(`${at}.title must be a non-empty string`);
    if (!Array.isArray(f.steps) || !f.steps.every(isNonEmptyString)) {
      errors.push(`${at}.steps must be an array of strings — the renderer enumerates them directly`);
    }
  }
}

function validateAccessControl(ac, entities, errors) {
  if (ac === undefined || ac === null) {
    errors.push('access_control is required — state "none" explicitly rather than omitting it');
    return;
  }
  if (typeof ac !== 'object' || Array.isArray(ac)) {
    errors.push('access_control must be an object');
    return;
  }
  if (!ACCESS_MODELS.includes(ac.model)) {
    errors.push(`access_control.model "${ac.model}" is not one of ${ACCESS_MODELS.join(', ')}`);
    return;
  }
  if (ac.model !== 'rls') return;

  if (!isNonEmptyString(ac.session_context)) {
    errors.push('access_control.session_context is required under RLS — policies read it');
  }
  const policies = Array.isArray(ac.policies) ? ac.policies : [];
  const covered = new Set(policies.flatMap((p) => (Array.isArray(p?.applies_to) ? p.applies_to : [])));

  // The check that catches a new table shipped without a policy.
  for (const e of entities) {
    if (e?.tenant_scoped !== true) continue;
    if (!covered.has(e.name)) {
      errors.push(
        `entity "${e.name}" is tenant_scoped but no access_control policy names it — under RLS an uncovered table is readable across tenants`,
      );
    }
  }
}

function validateInvariants(invariants, errors) {
  if (invariants === undefined) return;
  if (!Array.isArray(invariants)) {
    errors.push('invariants must be an array when present');
    return;
  }
  for (const [i, inv] of invariants.entries()) {
    const at = `invariants[${i}]`;
    if (inv === null || typeof inv !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(inv.id)) errors.push(`${at}.id must be a non-empty string`);
    if (!isNonEmptyString(inv.statement)) errors.push(`${at}.statement must be a non-empty string`);
    if (!isNonEmptyString(inv.enforced_by)) {
      errors.push(`${at}.enforced_by must name the file or symbol that enforces it — an invariant nobody enforces is a wish`);
    }
  }
}

function validateDesignSystem(ds, warnings) {
  if (ds === undefined || ds === null) {
    warnings.push('design_system is absent — :build will invent a palette per component');
    return;
  }
  const tokens = ds.tokens ?? {};
  for (const mode of ['light', 'dark']) {
    if (tokens[mode] === undefined) {
      warnings.push(`design_system.tokens.${mode} is missing — both modes should be designed, not one derived at build time`);
    }
  }
}

function crossCheckStack(components, stack, errors, warnings) {
  const hasStack = stack !== undefined && stack !== null;
  const slots = Array.isArray(stack?.slots) ? stack.slots : null;

  if (slots === null) {
    warnings.push(
      hasStack
        ? 'stack supplied but slots is missing or malformed — stack_slot references were not checked'
        : 'no stack supplied — stack_slot references were not checked',
    );
    return;
  }

  const slotIds = new Set(slots.map((s) => s?.id));
  for (const [i, c] of components.entries()) {
    if (c?.stack_slot === undefined) continue;
    if (!slotIds.has(c.stack_slot)) {
      errors.push(`components[${i}].stack_slot "${c.stack_slot}" is not a slot in stack.json`);
    }
  }

  const carriers = new Set(
    slots.filter((s) => s?.thesis_support === 'carries').map((s) => s?.id),
  );
  if (carriers.size > 0 && !components.some((c) => carriers.has(c?.stack_slot))) {
    warnings.push(
      'no component is built on the slot that carries the thesis — the win argument has a technology but nothing realising it',
    );
  }
}
