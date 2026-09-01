/**
 * Applies a validated submission.json to the project: renders all five surfaces
 * (docs/design/m5-design.md §4/§6) and writes them, backing up anything that already
 * exists first -- README.md included, since a hand edit there deserves the same
 * protection architect-apply.mjs already gives docs/architecture.md. Structured exactly
 * like architect-apply.mjs: validate -> precondition-check -> render every body in
 * memory -> dry-run branch -> one openBackupSet -> write -> merge state.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, SUBMISSION_FILE, statePath, timestamp } from './paths.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateSubmission } from './submission-schema.mjs';
import { renderReadme } from './render-readme.mjs';
import { renderRunbook } from './render-runbook.mjs';
import { renderDevpostSubmission } from './render-devpost-submission.mjs';
import { renderVideoScript, renderScreenshots } from './render-production-aids.mjs';

const SUBMISSION_FILE_REL = `${HACKATHON_DIR}/${SUBMISSION_FILE}`;

// A requirement can reach a terminal state (done/skipped) by a path other than this
// submission's own tracker -- e.g. a prior apply, or a user marking it skipped directly
// in state. Once state already says done/skipped, a stale or unrelated tracker claim
// must not revert it, so state's terminal status wins; otherwise the tracker's claim
// applies.
function mergedStatus(existingStatus, trackerStatus) {
  return existingStatus === 'done' || existingStatus === 'skipped' ? existingStatus : trackerStatus;
}

function outstandingHardRequirements(requirements) {
  return requirements.filter((r) => r.status !== 'done' && r.status !== 'skipped').map((r) => r.id);
}

export async function applySubmission(root, submission, {
  recon, deploy, stack, dryRun = false, stamp: stampOverride,
} = {}) {
  let state;
  if (dryRun) {
    state = await readMigratedState(root);
  } else {
    await migrateStateFile(root);
    state = await readState(root);
  }
  if (state === null) throw new Error(`no state at ${statePath(root)} -- run /win-hackathon:init first`);

  const { valid, errors } = validateSubmission(submission, { recon, state });
  if (!valid) throw new Error(`refusing to apply an invalid submission payload:\n  ${errors.join('\n  ')}`);

  if (state.project?.review?.clean !== true) {
    throw new Error('cannot submit -- review is not clean. run /win-hackathon:review first and resolve every blocking finding.');
  }

  const files = new Map([
    [SUBMISSION_FILE_REL, `${JSON.stringify(submission, null, 2)}\n`],
    ['README.md', renderReadme(submission, { deploy, stack })],
    ['docs/DEMO_RUNBOOK.md', renderRunbook(submission)],
    [`${HACKATHON_DIR}/submission.md`, renderDevpostSubmission(submission)],
    [`${HACKATHON_DIR}/video-script.md`, renderVideoScript(submission)],
    [`${HACKATHON_DIR}/screenshots.md`, renderScreenshots(submission)],
  ]);
  const artifacts = [...files.keys()];
  if (dryRun) return { artifacts, backedUp: [], wouldOverwrite: await existingPaths(root, artifacts) };

  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const rel of artifacts) {
    const saved = await set.backup(rel);
    if (saved !== null) backedUp.push(rel);
  }
  for (const [rel, body] of files) {
    const target = path.join(root, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }

  const tracker = submission.devpost_form.requirements_tracker;
  const trackerById = new Map(tracker.map((r) => [r.id, r.status]));
  const nextReqs = state.deliverables.submission_requirements.map((d) => (
    trackerById.has(d.id) ? { ...d, status: mergedStatus(d.status, trackerById.get(d.id)) } : d
  ));

  const bonus = submission.devpost_form.bonus_tracker;
  const bonusById = new Map(bonus.map((b) => [b.id, b]));
  const nextBonus = state.deliverables.bonus_content.map((b) => {
    const claim = bonusById.get(b.id);
    return claim ? { ...b, status: claim.status, url: claim.url ?? b.url, kind: claim.kind ?? b.kind, platform: claim.platform ?? b.platform } : b;
  });

  const outstanding = outstandingHardRequirements(nextReqs);
  const requirementsComplete = outstanding.length === 0;

  const next = {
    ...state,
    deliverables: { submission_requirements: nextReqs, bonus_content: nextBonus },
    project: {
      ...state.project,
      submission: { requirements_complete: requirementsComplete, ref: SUBMISSION_FILE_REL },
    },
    phases: {
      ...state.phases,
      submit: requirementsComplete
        ? { ...state.phases.submit, status: 'awaiting_approval', artifacts, resume_note: null }
        : {
          ...state.phases.submit, status: 'in_progress', artifacts,
          resume_note: `outstanding: ${outstanding.join(', ')}`,
        },
    },
  };
  await writeState(root, next);

  return {
    artifacts, backedUp, backupStamp: set.stamp, requirementsComplete, outstanding,
  };
}
