/**
 * Applies a validated stack.json to the project: renders both artifacts and writes them,
 * backing up either that already exists on disk first. Same shape as architect-apply.mjs:
 * compute everything in memory, validate, check the project precondition, then — unless
 * `dryRun` — back up and write. A `dryRun` call returns what would be written without
 * touching disk or state at all.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, STACK_FILE, statePath, timestamp } from './paths.mjs';
import {
  readState, writeState, migrateStateFile, readMigratedState, requireDescribedProject,
} from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateStack } from './stack-schema.mjs';
import { renderTable } from './render.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;

// `stack.slots` is validated non-empty by validateStack, so this is unreachable through
// applyStack; a direct caller can still pass an empty array. Deliberate, documented
// contract (task-18a-brief.md, Fix 9): the ## Stack section then carries only its heading,
// because renderTable([...], []) returns '' rather than a headerless table — an empty
// string composes correctly when a caller concatenates sections, and a header with no rows
// is not useful output. render-requirements.mjs (Task 19) follows the same contract.
export function renderStack(stack) {
  const out = [];
  out.push('# Stack');
  out.push('');
  out.push(`**Repository shape:** \`${stack.repo_shape}\``);
  out.push('');
  out.push(stack.shape_rationale);
  out.push('');
  out.push('## Stack');
  out.push('');
  out.push(renderTable(
    ['Slot', 'Choice', 'Source', 'Thesis', 'Why'],
    stack.slots.map((s) => [s.id, s.choice, s.source, s.thesis_support, s.rationale]),
  ));

  const pins = stack.bleeding_edge ?? [];
  if (pins.length > 0) {
    out.push('');
    out.push('## Bleeding edge');
    out.push('');
    out.push('Pins whose APIs may differ from any agent\'s training data. Read the vendored');
    out.push('docs before writing code against them.');
    out.push('');
    out.push(renderTable(
      ['Package', 'Pin', 'Docs'],
      pins.map((p) => [p.package, p.pin, p.docs_path ?? '—']),
    ));
  }

  const rejected = stack.rejected ?? [];
  if (rejected.length > 0) {
    out.push('');
    out.push('## Rejected');
    out.push('');
    // :submit draws on this. A rejected option with a stated reason is evidence of a
    // deliberate architectural choice, which is what Technical Implementation asks for.
    out.push(renderTable(
      ['Slot', 'Rejected', 'Why not'],
      rejected.map((r) => [r.slot ?? '—', r.choice, r.why_not]),
    ));
  }

  out.push('');
  return out.join('\n');
}

/** One false entry per required slot. :ship and :check flip them in M4. */
export function buildComplianceSeed(stack) {
  const seed = {};
  for (const slot of stack.slots ?? []) {
    if (slot?.source !== 'required') continue;
    const ref = slot?.requirement_ref;
    if (typeof ref === 'string' && ref.trim() !== '') seed[ref] = false;
  }
  return seed;
}

export function primaryDatabase(stack) {
  const dbSlot = (stack.slots ?? []).find((s) => /(^|[-_])db$|database|datastore/i.test(s?.id ?? ''));
  return dbSlot?.choice ?? null;
}

export async function applyStack(root, stack, { recon, dryRun = false, stamp: stampOverride } = {}) {
  const { valid, errors } = validateStack(stack, recon);
  if (!valid) {
    throw new Error(`refusing to apply an invalid stack payload:\n  ${errors.join('\n  ')}`);
  }

  // A dry-run's contract is that the filesystem ends up exactly as it started —
  // including an old-schema state.json. migrateStateFile() would rewrite it before the
  // preview even if dryRun is true, so on a dry run the migration happens in memory only
  // (same defect and fix as applyArchitecture's, task-18a-brief.md Fix 7 / review round 1
  // I2): the :stack dry-run preview is where this plugin's per-file overwrite consent
  // actually happens, so a dry run with a side effect undermines that consent gate. The
  // non-dry-run path still migrates on disk, unchanged.
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

  // relPath (repo-relative) -> body. Computed before any write, same shape as
  // architect-apply.mjs: everything below this point is safe to touch disk with.
  const files = [
    [STACK_FILE, `${JSON.stringify(stack, null, 2)}\n`],
    ['stack.md', renderStack(stack)],
  ];
  const artifacts = files.map(([name]) => rel(name));
  // A preview must say what it would destroy, or the command file's "tell the user before
  // applying if it would overwrite something" step has no output to act on. Read-only.
  if (dryRun) return { artifacts, backedUp: [], wouldOverwrite: await existingPaths(root, artifacts) };

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  // One backup set, opened once, shared by every backup below -- that sharing is the whole
  // backup promise: a single apply run must produce one coherent, co-timestamped backup set,
  // not one directory per file, and no other run may write into it. `stampOverride` exists so
  // a test can inject a known value and observe on disk that this call actually used it.
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const [name] of files) {
    const saved = await set.backup(rel(name));
    if (saved !== null) backedUp.push(rel(name));
  }

  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }

  const next = {
    ...state,
    project: {
      ...state.project,
      stack: {
        repo_shape: stack.repo_shape,
        primary_database: primaryDatabase(stack),
        ref: rel(STACK_FILE),
      },
    },
    compliance: {
      ...state.compliance,
      // Merge, never replace: a re-run of :stack must not un-verify something :check
      // already confirmed -- for any slot the fresh stack.json still has. A slot the
      // fresh seed no longer has must NOT survive: compliance-checker's report is scoped
      // to the current stack.json, so a stale key it will never mention would otherwise
      // sit in required_tech_verified forever, permanently failing applyCompliance's
      // completeness guard with no way to clear it.
      required_tech_verified: (() => {
        const seed = buildComplianceSeed(stack);
        const existing = state.compliance?.required_tech_verified ?? {};
        const prunedExisting = Object.fromEntries(
          Object.entries(existing).filter(([key]) => key in seed),
        );
        return { ...seed, ...prunedExisting };
      })(),
    },
    phases: {
      ...state.phases,
      stack: { ...state.phases.stack, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, backupStamp: set.stamp };
}
