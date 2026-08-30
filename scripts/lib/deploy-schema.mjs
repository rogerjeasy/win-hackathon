export const DEPLOY_SCHEMA_VERSION = 1;
export const TARGET_STRATEGIES = ['vercel', 'cloud-run', 'railway', 'render', 'aws', 'docker-compose'];
export const AUTH_KINDS = ['wif', 'oidc', 'static-secret'];
const SERVICE_KINDS = ['frontend', 'backend', 'agent', 'worker'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * `stack` slots that plausibly need a running, deployed service. Anything without a
 * clearly database/queue/storage-shaped id is assumed deployable -- the same "is this a
 * database slot" heuristic stack-apply.mjs's primaryDatabase() already uses, inverted.
 */
function deployableSlots(stack) {
  return (stack?.slots ?? []).filter((s) =>
    !/(^|[-_])db$|database|datastore|queue|storage|cache/i.test(s?.id ?? ''));
}

export function validateDeploy(doc, stack) {
  const errors = [];
  const warnings = [];
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['deploy must be an object'], warnings };
  }
  if (!TARGET_STRATEGIES.includes(doc.target_strategy)) {
    errors.push(`target_strategy "${doc.target_strategy}" is not one of ${TARGET_STRATEGIES.join(', ')}`);
  }

  const services = Array.isArray(doc.services) ? doc.services : null;
  if (services === null || services.length === 0) {
    errors.push('services must be a non-empty array');
  } else {
    for (const [i, s] of services.entries()) {
      const at = `services[${i}]`;
      if (!isNonEmptyString(s?.name)) errors.push(`${at}.name must be a non-empty string`);
      if (!SERVICE_KINDS.includes(s?.kind)) errors.push(`${at}.kind must be one of ${SERVICE_KINDS.join(', ')}`);
      if (!isNonEmptyString(s?.target)) errors.push(`${at}.target must be a non-empty string`);
      if (s?.verified === true) {
        if (!isNonEmptyString(s?.verified_at)) errors.push(`${at}.verified_at is required when verified is true`);
        if (!isNonEmptyString(s?.verification_method)) errors.push(`${at}.verification_method is required when verified is true`);
      }
    }
  }

  if (stack) {
    const wanted = deployableSlots(stack);
    const serviceNames = new Set((services ?? []).map((s) => s?.name));
    for (const slot of wanted) {
      // A stack slot's id (e.g. "frontend", "api") is the best available correlation key
      // to a deploy service name -- there is no formal cross-reference field, the same
      // gap requirements.json's component_refs fills for architecture but stack.json has
      // no equivalent for deploy targets.
      if (!serviceNames.has(slot.id)) {
        errors.push(`stack slot "${slot.id}" has no matching service in deploy.json`);
      }
    }
  } else {
    warnings.push('no stack supplied -- service-to-slot coverage was not checked');
  }

  if (doc.cicd?.auth !== undefined && !AUTH_KINDS.includes(doc.cicd.auth)) {
    errors.push(`cicd.auth "${doc.cicd.auth}" is not one of ${AUTH_KINDS.join(', ')}`);
  } else if (doc.cicd?.auth === 'static-secret') {
    warnings.push('cicd.auth static-secret is a fallback, not the default -- say so plainly to the user.');
  }

  return { valid: errors.length === 0, errors, warnings };
}
