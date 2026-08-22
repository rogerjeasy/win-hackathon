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
