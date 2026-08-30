/**
 * Applies a validated requirements.json to the project: writes the JSON payload, renders
 * `.hackathon/requirements.md`, and emits one `features/<slug>.feature` file per feature.
 * Same shape as stack-apply.mjs and architect-apply.mjs: validate, load state, check the
 * project precondition, compute every artifact body in memory, then — unless `dryRun` —
 * back up and write.
 *
 * `.hackathon/requirements.json` and `.hackathon/requirements.md` are backed up before being
 * overwritten, same treatment stack-apply.mjs gives `stack.json`/`stack.md`. The
 * `features/<slug>.feature` files are deliberately NOT backed up: regenerating them on every
 * run is the intended contract (the gherkin-requirements skill tells the user never to
 * hand-edit one, because the next :requirements run overwrites it), so there is nothing to
 * protect a hand edit from.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  HACKATHON_DIR, REQUIREMENTS_FILE, FEATURES_DIR, statePath, timestamp,
} from './paths.mjs';
import {
  readState, writeState, migrateStateFile, readMigratedState, requireDescribedProject,
} from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateRequirements } from './requirements-schema.mjs';
import { renderRequirements } from './render-requirements.mjs';
import { emitAllGherkin } from './emit-gherkin.mjs';

export async function applyRequirements(
  root, requirements, { recon, architecture, dryRun = false, stamp: stampOverride } = {},
) {
  const { valid, errors } = validateRequirements(requirements, { recon, architecture });
  if (!valid) {
    throw new Error(`refusing to apply an invalid requirements payload:\n  ${errors.join('\n  ')}`);
  }

  // A dry-run's contract is that the filesystem ends up exactly as it started — including
  // an old-schema state.json. migrateStateFile() would rewrite it before the preview even
  // if dryRun is true, so on a dry run the migration happens in memory only (same defect
  // and fix as applyStack's and applyArchitecture's, task-18a-brief.md Fix 7 / review round
  // 1 I2). The non-dry-run path still migrates on disk, unchanged.
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
  requireDescribedProject(state, root);

  // relPath -> body, for the two artifacts that get backed up on overwrite.
  const backedUpFiles = new Map([
    [`${HACKATHON_DIR}/${REQUIREMENTS_FILE}`, `${JSON.stringify(requirements, null, 2)}\n`],
    [`${HACKATHON_DIR}/requirements.md`, renderRequirements(requirements, architecture)],
  ]);

  // relPath -> body, for the Gherkin files. Kept separate from backedUpFiles because these
  // are never backed up (see file header) even though both sets are written the same way.
  const gherkin = emitAllGherkin(requirements);
  const featureFiles = new Map();
  for (const [slug, body] of gherkin) featureFiles.set(`${FEATURES_DIR}/${slug}.feature`, body);

  const files = new Map([...backedUpFiles, ...featureFiles]);

  // A .feature file from a previous run whose feature has since been dropped. Report it;
  // deleting a file the user may have edited is worse than leaving it.
  const skipped = [];
  const existing = await readdir(path.join(root, FEATURES_DIR)).catch((err) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  const current = new Set([...gherkin.keys()].map((s) => `${s}.feature`));
  for (const name of existing) {
    if (name.endsWith('.feature') && !current.has(name)) {
      skipped.push(`${FEATURES_DIR}/${name} — no longer in requirements.json; left in place`);
    }
  }

  const artifacts = [...files.keys()];
  // A preview must say what it would destroy, or the command file's "tell the user before
  // applying" step has no output to act on. Read-only, and it covers every artifact, not
  // just the two that get backed up — a regenerated .feature file is still overwritten.
  if (dryRun) {
    return { artifacts, backedUp: [], skipped, wouldOverwrite: await existingPaths(root, artifacts) };
  }

  // One backup set, opened once, shared by every backup below, so a single apply run
  // produces one coherent, co-timestamped backup set rather than one directory per file —
  // and no other run can land in it. `stampOverride` exists so a test can inject a known
  // value and observe on disk that this call actually used it.
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const rel of backedUpFiles.keys()) {
    const saved = await set.backup(rel);
    if (saved !== null) backedUp.push(rel);
  }

  for (const [rel, body] of files) {
    const target = path.join(root, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }

  // The Gherkin set varies with the feature list, so it is deliberately not declared as a
  // phase artifact — the drift check would otherwise fire on a correct state.
  const declared = [`${HACKATHON_DIR}/${REQUIREMENTS_FILE}`, `${HACKATHON_DIR}/requirements.md`];

  const next = {
    ...state,
    project: { ...state.project, requirements_ref: `${HACKATHON_DIR}/${REQUIREMENTS_FILE}` },
    phases: {
      ...state.phases,
      requirements: { ...state.phases.requirements, status: 'awaiting_approval', artifacts: declared },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, skipped, backupStamp: set.stamp };
}
