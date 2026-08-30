/**
 * :check has no JSON contract of its own (docs/design/m4-design.md §2) -- it overwrites
 * state.json.compliance in place. The agent's report carries `evidence` per slot so the
 * CLI can print it; only the boolean survives into state.json, which stays a digest.
 */
import { readState, writeState, migrateStateFile } from './state.mjs';
import { statePath } from './paths.mjs';

export function validateComplianceReport(report) {
  const errors = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return { valid: false, errors: ['compliance report must be an object'] };
  }
  const verified = report.required_tech_verified;
  if (verified === undefined || typeof verified !== 'object' || Array.isArray(verified)) {
    errors.push('required_tech_verified must be an object');
  } else {
    for (const [key, entry] of Object.entries(verified)) {
      if (entry === null || typeof entry !== 'object') {
        errors.push(`required_tech_verified["${key}"] must be an object`);
        continue;
      }
      if (typeof entry.used !== 'boolean') errors.push(`required_tech_verified["${key}"].used must be a boolean`);
      if (entry.evidence !== null && typeof entry.evidence !== 'string') {
        errors.push(`required_tech_verified["${key}"].evidence must be a string or null`);
      }
      if (entry.used === true && (entry.evidence === null || entry.evidence.trim() === '')) {
        errors.push(`required_tech_verified["${key}"] is marked used with no evidence -- a dependency in a manifest is not evidence`);
      }
    }
  }
  const forbidden = report.forbidden_tech_found;
  if (forbidden !== undefined) {
    const isArrayOfStrings = Array.isArray(forbidden) && forbidden.every((x) => typeof x === 'string');
    if (!isArrayOfStrings) errors.push('forbidden_tech_found must be an array of strings');
  }
  return { valid: errors.length === 0, errors };
}

export async function applyCompliance(root, report, { now = new Date() } = {}) {
  const { valid, errors } = validateComplianceReport(report);
  if (!valid) throw new Error(`refusing to apply an invalid compliance report:\n  ${errors.join('\n  ')}`);

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) throw new Error(`no state at ${statePath(root)} -- run /win-hackathon:init first`);

  const flat = Object.fromEntries(
    Object.entries(report.required_tech_verified).map(([k, v]) => [k, v.used]),
  );
  const forbiddenFound = report.forbidden_tech_found ?? [];

  await writeState(root, {
    ...state,
    compliance: {
      required_tech_verified: flat,
      forbidden_tech_found: forbiddenFound,
      last_checked: now.toISOString(),
    },
  });

  return {
    outstanding: Object.entries(flat).filter(([, used]) => !used).map(([id]) => id),
    forbiddenFound,
  };
}
