/**
 * :review's payload is assembled from two sources (docs/design/m5-design.md §3, §6):
 * the /code-review skill, which has no JSON contract of its own and runs inline in the
 * orchestrating conversation, and the quality-reviewer agent, whose report matches
 * compliance-checker's shape. mergeFindings() is the one place REV- ids get assigned.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, REVIEW_FILE, statePath, timestamp } from './paths.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateReview, isClean, blockingFindings } from './review-schema.mjs';
import { renderReview } from './render-review.mjs';

const REVIEW_FILE_REL = `${HACKATHON_DIR}/${REVIEW_FILE}`;
const REVIEW_MD_REL = `${HACKATHON_DIR}/review.md`;

/**
 * Accepts either a bare findings array or the `{ findings: [...] }` shape
 * quality-reviewer.md documents as its own report -- an orchestrating LLM can plausibly
 * hand mergeFindings() the whole report object instead of extracting the array first.
 * Anything else is a clear, named error, not a raw "findings.map is not a function".
 */
function toFindingsArray(value, label) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.findings)) return value.findings;
  throw new Error(
    `mergeFindings: ${label} must be an array of findings or an object shaped { findings: [...] } -- got ${typeof value}`,
  );
}

export function mergeFindings(codeReviewFindings, qualityReviewerFindings) {
  let n = 0;
  const withIds = (findings, source) => findings.map((f) => {
    n += 1;
    return { ...f, id: `REV-${n}`, source };
  });
  return {
    schema_version: 1,
    findings: [
      ...withIds(toFindingsArray(codeReviewFindings, 'codeReviewFindings'), 'code-review'),
      ...withIds(toFindingsArray(qualityReviewerFindings, 'qualityReviewerFindings'), 'quality-reviewer'),
    ],
  };
}

export async function applyReview(root, review, { dryRun = false, stamp: stampOverride } = {}) {
  const { valid, errors } = validateReview(review);
  if (!valid) throw new Error(`refusing to apply an invalid review payload:\n  ${errors.join('\n  ')}`);

  let state;
  if (dryRun) {
    state = await readMigratedState(root);
  } else {
    await migrateStateFile(root);
    state = await readState(root);
  }
  if (state === null) throw new Error(`no state at ${statePath(root)} -- run /win-hackathon:init first`);

  const files = new Map([
    [REVIEW_FILE_REL, `${JSON.stringify(review, null, 2)}\n`],
    [REVIEW_MD_REL, renderReview(review)],
  ]);
  const artifacts = [...files.keys()];
  if (dryRun) return { artifacts, backedUp: [], wouldOverwrite: await existingPaths(root, artifacts) };

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const rel of artifacts) {
    const saved = await set.backup(rel);
    if (saved !== null) backedUp.push(rel);
  }
  for (const [rel, body] of files) {
    await writeFile(path.join(root, rel), body, 'utf8');
  }

  const clean = isClean(review);
  const blocking = blockingFindings(review).map((f) => f.id);
  const next = {
    ...state,
    project: { ...state.project, review: { clean, ref: REVIEW_FILE_REL } },
    phases: {
      ...state.phases,
      review: clean
        ? { ...state.phases.review, status: 'awaiting_approval', artifacts, resume_note: null }
        : {
          ...state.phases.review, status: 'in_progress', artifacts,
          resume_note: `blocking: ${blocking.join(', ')}`,
        },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, backupStamp: set.stamp, clean, blocking };
}
