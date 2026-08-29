/**
 * Applies a validated requirements.json (plus the architecture it was validated against) to
 * the project: writes the Kiro spec triad — requirements.md / design.md / tasks.md per
 * must-have feature — and drives OpenSpec to write one change proposal per must-have.
 *
 * Same shape as stack-apply.mjs, architect-apply.mjs and requirements-apply.mjs: validate,
 * load state, compute every artifact body in memory, then — unless `dryRun` — back up and
 * write.
 *
 * A dry-run's contract is that the filesystem ends up exactly as it started — including an
 * old-schema state.json. migrateStateFile() would rewrite it before the preview even if
 * dryRun is true, so on a dry run the migration happens in memory only (same defect and fix
 * as applyStack's, applyArchitecture's and applyRequirements', task-18a-brief.md Fix 7 /
 * review round 1 I2).
 *
 * `.hackathon/specs/` is created unconditionally on every non-dry-run apply, even when the
 * triad map is empty (a requirements payload with zero must-have features — validateRequirements
 * permits this). The phase always declares SPECS_REL as its artifact regardless of feature
 * count, so a declaration that the directory exists must always be true, or an approved phase
 * drifts permanently (round-1 review finding: the same class of bug this file's own commit
 * message describes avoiding for openspec/, reintroduced here for the triad).
 *
 * Every triad file is backed up via backupFile() before being overwritten, the same
 * protection stack-apply.mjs, architect-apply.mjs and requirements-apply.mjs give their own
 * generated files. tasks.md in particular is meant to be hand-edited — it is a checklist
 * M4's build agent ticks off as it works — so clobbering it silently on a rerun is worse here
 * than for any other generated file in the plugin (round-1 review finding).
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, SPECS_DIR, statePath, timestamp } from './paths.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { backupFile } from './backup.mjs';
import { validateRequirements } from './requirements-schema.mjs';
import { emitKiro } from './emit-kiro.mjs';
import { runOpenspec } from './openspec.mjs';

const SPECS_REL = `${HACKATHON_DIR}/${SPECS_DIR}`;

export async function applySpec(root, { requirements, architecture, exec, dryRun = false } = {}) {
  const { valid, errors, warnings } = validateRequirements(requirements, { architecture });
  if (!valid) {
    throw new Error(`refusing to apply an invalid requirements payload:\n  ${errors.join('\n  ')}`);
  }

  let state;
  if (dryRun) {
    state = await readMigratedState(root);
  } else {
    await migrateStateFile(root);
    state = await readState(root);
  }
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const triad = emitKiro(requirements, architecture);

  const skipped = [];
  const existing = await readdir(path.join(root, SPECS_REL)).catch(() => []);
  for (const name of existing) {
    if (!triad.has(name)) {
      skipped.push(`${SPECS_REL}/${name} — no longer a must-have feature; left in place`);
    }
  }

  const artifacts = [];
  for (const [dir, files] of triad) {
    for (const name of Object.keys(files)) artifacts.push(`${SPECS_REL}/${dir}/${name}`);
  }

  const openspec = await runOpenspec(root, requirements, architecture, { exec, dryRun });
  artifacts.push(...openspec.artifacts);

  if (dryRun) return { artifacts, openspec, skipped, backedUp: [], warnings };

  // Back up every triad file that already exists before it is overwritten. One stamp,
  // computed once, shared by every backupFile() call below, so a single apply run produces
  // one coherent, co-timestamped backup set rather than one directory per file.
  const stamp = timestamp();
  const backedUp = [];
  for (const [dir, files] of triad) {
    for (const name of Object.keys(files)) {
      const rel = `${SPECS_REL}/${dir}/${name}`;
      const saved = await backupFile(root, rel, stamp);
      if (saved !== null) backedUp.push(rel);
    }
  }

  // Created unconditionally, regardless of how many must-have features exist. When triad is
  // empty the write loop below never runs, and this is the only thing that makes the
  // unconditional `artifacts: [SPECS_REL]` declaration below actually true.
  await mkdir(path.join(root, SPECS_REL), { recursive: true });

  for (const [dir, files] of triad) {
    const target = path.join(root, SPECS_REL, dir);
    await mkdir(target, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await writeFile(path.join(target, name), body, 'utf8');
    }
  }

  // Only the specs directory is declared. openspec/ may legitimately be absent when the CLI
  // was unreachable, and declaring it would make the drift check fire on a correct state.
  const next = {
    ...state,
    phases: {
      ...state.phases,
      spec: { ...state.phases.spec, status: 'awaiting_approval', artifacts: [SPECS_REL] },
    },
  };
  await writeState(root, next);

  return { artifacts, openspec, skipped, backedUp, warnings };
}
