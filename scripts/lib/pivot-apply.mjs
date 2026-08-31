/**
 * Triage over an existing judgment, not a new one -- appends to project.cut_features and
 * decisions.md; requirements.json, the Gherkin and the Kiro triad are never touched
 * (docs/design/m4-design.md §2, §5).
 */
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, statePath } from './paths.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { mustHaveFeatures, featureDone } from './build-apply.mjs';

export function remainingHours(state, { now = new Date() } = {}) {
  const deadline = state.hackathon?.deadline;
  if (!deadline) return null;
  return (Date.parse(deadline) - now.getTime()) / 3_600_000;
}

export function phaseBudgetOutstanding(state) {
  const budget = state.budget?.phase_budget ?? {};
  let total = 0;
  for (const [phase, hours] of Object.entries(budget)) {
    const status = state.phases?.[phase]?.status;
    if (status !== 'approved' && status !== 'skipped') total += hours;
  }
  return total;
}

/** The same "sole claim on a rubric criterion" condition requirements-schema.mjs's
 * crossCheckRecon computes for a validation error message, recomputed here as a
 * per-feature boolean a caller can act on rather than a doc-level error string.
 *
 * Counted over must-have features only, not "must or should" -- a should-have
 * feature's claim on a criterion doesn't guarantee anything (a should-have "may
 * not get built", per requirements-schema.mjs's own crossCheckRecon warning), so
 * it can't satisfy the actual rationale here: cutting a true sole-must-claimant
 * would *guarantee* a zero on that criterion, which is what this must prevent. */
function annotateSoleClaims(musts) {
  const claimCount = new Map();
  for (const f of musts) {
    for (const ref of f.criterion_refs ?? []) {
      claimCount.set(ref, (claimCount.get(ref) ?? 0) + 1);
    }
  }
  return musts.map((f) => ({
    id: f.requirements?.[0]?.id ?? f.id,
    slug: f.slug,
    criterionRefs: f.criterion_refs ?? [],
    soleClaim: (f.criterion_refs ?? []).some((ref) => claimCount.get(ref) === 1),
  }));
}

export async function cutCandidates(root, requirements, cutFeatures = []) {
  const musts = (requirements.features ?? []).filter((f) => f.priority === 'must');
  const annotated = annotateSoleClaims(musts);
  const dirs = mustHaveFeatures(requirements, []); // full numbering, cuts excluded later
  const bySlug = new Map(dirs.map((d) => [d.slug, d.dir]));
  const cut = new Set(cutFeatures);
  const notDone = [];
  for (const c of annotated) {
    if (cut.has(c.id)) continue;
    const dir = bySlug.get(c.slug);
    if (dir && (await featureDone(root, dir))) continue;
    notDone.push(c);
  }
  return notDone;
}

export function rankCutCandidates(candidates) {
  return [...candidates]
    .map((c) => ({ ...c, neverPropose: c.soleClaim }))
    .sort((a, b) => Number(a.neverPropose) - Number(b.neverPropose));
}

export async function applyPivot(root, cutIds, rationale, { now = new Date() } = {}) {
  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) throw new Error(`no state at ${statePath(root)} -- run /win-hackathon:init first`);

  const existing = new Set(state.project?.cut_features ?? []);
  for (const id of cutIds) existing.add(id);

  await writeState(root, {
    ...state,
    project: { ...state.project, cut_features: [...existing] },
  });

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });
  const date = now.toISOString().slice(0, 10);
  const entry = `\n## ${date} — Cut: ${cutIds.join(', ')}\n\n${rationale}\n`;
  await appendFile(path.join(dir, 'decisions.md'), entry, 'utf8');
}
