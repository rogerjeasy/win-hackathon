import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { statePath } from './paths.mjs';
import { validateState, CURRENT_SCHEMA_VERSION } from './schema.mjs';

export async function readState(root) {
  let raw;
  try {
    raw = await readFile(statePath(root), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${statePath(root)} could not be parsed as JSON`);
  }
  const { valid, errors } = validateState(parsed);
  if (!valid) {
    throw new Error(
      `${statePath(root)} is valid JSON but not a valid win-hackathon state: ${errors.join('; ')}`,
    );
  }
  return parsed;
}

export async function writeState(root, state) {
  const { valid, errors } = validateState(state);
  if (!valid) throw new Error(`refusing to write invalid state: ${errors.join('; ')}`);

  const target = statePath(root);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

/**
 * `:stack` and `:architect` both merge into `state.project` and then call writeState(),
 * whose schema-v3 validation requires `project.name` and `project.selected_idea`. On a
 * project where `:describe` has not run — `project: null`, exactly what `:init` creates —
 * that merge produces an object missing both fields, and writeState() throws only after
 * every artifact is already on disk. Calling this before any write means the same refusal
 * happens up front instead, with an actionable message rather than a schema complaint.
 */
export function requireDescribedProject(state, root) {
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';
  const p = state.project;
  if (!p || !nonEmpty(p.name) || !nonEmpty(p.selected_idea)) {
    throw new Error(
      `no project set in ${statePath(root)} — run /win-hackathon:describe first`,
    );
  }
}

export async function updateState(root, fn) {
  const current = await readState(root);
  if (current === null) throw new Error(`no state at ${statePath(root)}`);
  const next = (await fn(current)) ?? current;
  await writeState(root, next);
  return next;
}

/**
 * Parse state.json WITHOUT validating it. readState() validates and therefore throws on
 * an older schema — which is exactly the state migration needs to read. Use this only
 * on the migration path.
 */
export async function readRawState(root) {
  let raw;
  try {
    raw = await readFile(statePath(root), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${statePath(root)} could not be parsed as JSON`);
  }
}

export function migrateState(state) {
  const from = state.schema_version;
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `state schema_version ${from} is newer than supported ${CURRENT_SCHEMA_VERSION}; upgrade the plugin`,
    );
  }
  let next = state;
  let migrated = false;

  // v1 -> v2: add the deliverables block. Additive only; nothing is reshaped or dropped,
  // which is what makes re-running this safe.
  if (next.schema_version === 1) {
    next = {
      ...next,
      schema_version: 2,
      deliverables: next.deliverables ?? { submission_requirements: [], bonus_content: [] },
    };
    migrated = true;
  }

  // v2 -> v3: no field is added here. v3 differs from v2 only in that `project` is now
  // validated, and every v2 project shape that was legal is still legal, so the migration
  // is a version bump alone. Stated explicitly because an empty migration branch looks
  // like an oversight otherwise.
  if (next.schema_version === 2) {
    next = { ...next, schema_version: 3 };
    migrated = true;
  }

  // v3 -> v4: adds hackathon.started_at, project.cut_features, project.deploy, and
  // budget.last_commit. Also the first version where compliance and budget are
  // validated -- every v3 state that was legal already satisfies the new checks
  // (booleans, non-negative numbers), so no reshaping happens, only new fields.
  if (next.schema_version === 3) {
    next = {
      ...next,
      schema_version: 4,
      hackathon: next.hackathon === null || next.hackathon === undefined
        ? next.hackathon
        : { ...next.hackathon, started_at: next.hackathon.started_at ?? null },
      project: next.project === null || next.project === undefined
        ? next.project
        : {
          ...next.project,
          cut_features: next.project.cut_features ?? [],
          deploy: next.project.deploy ?? { primary_url: null, ref: null },
        },
      budget: { ...next.budget, last_commit: next.budget?.last_commit ?? null },
    };
    migrated = true;
  }

  // v4 -> v5: adds project.review and project.submission. Additive only -- every v4
  // state that was legal stays legal; these two fields are simply absent until :review
  // or :submit runs once.
  if (next.schema_version === 4) {
    next = {
      ...next,
      schema_version: 5,
      project: next.project === null || next.project === undefined
        ? next.project
        : {
          ...next.project,
          review: next.project.review ?? { clean: null, ref: null },
          submission: next.project.submission ?? { requirements_complete: false, ref: null },
        },
    };
    migrated = true;
  }

  return { state: next, migrated, from };
}

/** Migrate the on-disk state file in place. Safe to call when there is no state file. */
export async function migrateStateFile(root) {
  const raw = await readRawState(root);
  if (raw === null) return { migrated: false, from: null };
  const { state, migrated, from } = migrateState(raw);
  if (migrated) await writeState(root, state);
  return { migrated, from };
}

/**
 * Read + migrate state WITHOUT writing anything to disk — for a dry-run preview, where the
 * filesystem must end up exactly as it started. Mirrors what `migrateStateFile()` followed
 * by `readState()` would hand back, minus the write: parse, migrate in memory, validate the
 * migrated shape the same way `readState()` does. Returns `null` when there is no state file.
 */
export async function readMigratedState(root) {
  const raw = await readRawState(root);
  if (raw === null) return null;
  const { state } = migrateState(raw);
  const { valid, errors } = validateState(state);
  if (!valid) {
    throw new Error(
      `${statePath(root)} is valid JSON but not a valid win-hackathon state: ${errors.join('; ')}`,
    );
  }
  return state;
}
