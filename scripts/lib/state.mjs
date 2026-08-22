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

export function migrateState(state) {
  const from = state.schema_version;
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `state schema_version ${from} is newer than supported ${CURRENT_SCHEMA_VERSION}; upgrade the plugin`,
    );
  }
  // v1 is the first schema; no prior versions exist to migrate from yet.
  return { state, migrated: false, from };
}
