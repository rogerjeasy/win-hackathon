/**
 * Applies a validated requirements.json (plus the architecture it was validated against) to
 * the project: writes the Kiro spec triad — requirements.md / design.md / tasks.md per
 * must-have feature — and drives OpenSpec to write one change proposal per must-have.
 *
 * Close to the shape of stack-apply.mjs, architect-apply.mjs and requirements-apply.mjs —
 * validate, load state, compute in memory, then back up and write — with one deliberate
 * difference worth stating plainly, because the "nothing is written before everything is
 * computed" claim does not hold end to end here. The real order is: validate; load state;
 * compute the triad in memory; run OpenSpec, which writes `openspec/changes/<slug>/proposal.md`
 * to disk before the triad's backup loop runs. That write is non-destructive by nature —
 * each proposal is regenerated from the same payload and no other producer writes there — so
 * it costs nothing if a later step fails. The Kiro triad, which CAN destroy hand edits, is
 * computed, then backed up, then written, with nothing in between.
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
 * Every triad file is backed up before being overwritten, the same
 * protection stack-apply.mjs, architect-apply.mjs and requirements-apply.mjs give their own
 * generated files. tasks.md in particular is meant to be hand-edited — it is a checklist
 * M4's build agent ticks off as it works — so clobbering it silently on a rerun is worse here
 * than for any other generated file in the plugin (round-1 review finding).
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, SPECS_DIR, statePath, timestamp } from './paths.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateRequirements } from './requirements-schema.mjs';
import { emitKiro } from './emit-kiro.mjs';
import { runOpenspec } from './openspec.mjs';

const SPECS_REL = `${HACKATHON_DIR}/${SPECS_DIR}`;

/** `0002-medication-safety` -> `medication-safety`; a name that isn't a spec folder -> null. */
function folderSlug(name) {
  const m = /^\d+-(.+)$/.exec(name);
  return m === null ? null : m[1];
}

export async function applySpec(
  root, { requirements, architecture, exec, dryRun = false, stamp: stampOverride } = {},
) {
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

  // emitKiro() numbers folders by position in the must-have list, so reprioritising features
  // between two applies renumbers every folder after the change. A feature's identity is its
  // slug, though — validated unique, and what emit-gherkin.mjs and openspec.mjs key on — so
  // an existing folder is matched by its `-<slug>` suffix, not by its full name, and reused
  // under the name it already has. Without this, demoting one must-have orphans every later
  // feature's folder: a build agent's ticked-off tasks.md is stranded under a name nothing
  // reads again, and the feature is falsely reported as no longer a must-have.
  const existing = await readdir(path.join(root, SPECS_REL)).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  const existingBySlug = new Map();
  for (const name of existing) {
    const slug = folderSlug(name);
    if (slug !== null) existingBySlug.set(slug, name);
  }

  // dirName -> files, with each feature's existing folder reused when it has one. The
  // NNNN-<slug> format is unchanged; only which of those names a feature lands in.
  const planned = new Map();
  const currentSlugs = new Set();
  for (const [dir, files] of triad) {
    const slug = folderSlug(dir);
    currentSlugs.add(slug);
    planned.set(existingBySlug.get(slug) ?? dir, files);
  }

  // A folder is stale only when its slug is genuinely absent from the must-have set — never
  // merely because it was renumbered, which is what the reuse above already handled.
  const skipped = [];
  for (const name of existing) {
    const slug = folderSlug(name);
    if (slug === null) {
      skipped.push(`${SPECS_REL}/${name} — not a generated spec folder; left in place`);
    } else if (!currentSlugs.has(slug)) {
      skipped.push(`${SPECS_REL}/${name} — no longer a must-have feature; left in place`);
    }
  }

  const artifacts = [];
  for (const [dir, files] of planned) {
    for (const name of Object.keys(files)) artifacts.push(`${SPECS_REL}/${dir}/${name}`);
  }

  const openspec = await runOpenspec(root, requirements, architecture, { exec, dryRun });
  artifacts.push(...openspec.artifacts);

  // A preview must say what it would destroy — tasks.md above all, which a build agent ticks
  // off — or the command file's overwrite-consent step has no output to act on. Read-only.
  if (dryRun) {
    return {
      artifacts, openspec, skipped, backedUp: [], warnings,
      wouldOverwrite: await existingPaths(root, artifacts),
    };
  }

  // Back up every triad file that already exists before it is overwritten. One backup set,
  // opened once, shared by every backup below, so a single apply run produces one coherent,
  // co-timestamped backup set rather than one directory per file — and a second apply in the
  // same wall-clock second gets its own directory instead of overwriting this one.
  // `stampOverride` exists so a test can inject a known value and observe on disk that this
  // call actually used it.
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const [dir, files] of planned) {
    for (const name of Object.keys(files)) {
      const rel = `${SPECS_REL}/${dir}/${name}`;
      const saved = await set.backup(rel);
      if (saved !== null) backedUp.push(rel);
    }
  }

  // Created unconditionally, regardless of how many must-have features exist. When triad is
  // empty the write loop below never runs, and this is the only thing that makes the
  // unconditional `artifacts: [SPECS_REL]` declaration below actually true.
  await mkdir(path.join(root, SPECS_REL), { recursive: true });

  for (const [dir, files] of planned) {
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

  return { artifacts, openspec, skipped, backedUp, warnings, backupStamp: set.stamp };
}
