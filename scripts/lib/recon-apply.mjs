import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateRecon } from './recon-schema.mjs';
import { renderBrief, renderRules, renderCriteria } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, RECON_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;

/** The soonest `action` date still ahead of `now`, or null. */
export function nextActionDeadline(dates = [], now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Date.parse(now);
  const upcoming = dates
    .filter((d) => d.kind === 'action' && Date.parse(d.at) > ms)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const next = upcoming[0];
  return next ? { label: next.label, at: next.at } : null;
}

/** Flatten a required-tech entry into one printable string for the hook and status board. */
function techLabel(t) {
  if (typeof t === 'string') return t;
  const oneOf = Array.isArray(t.one_of) && t.one_of.length > 0 ? ` (${t.one_of.join(' | ')})` : '';
  return `${t.name}${oneOf}`;
}

export function buildHackathonDigest(recon, { now = new Date() } = {}) {
  const hard = (recon.dates ?? []).find((d) => d.kind === 'hard');
  const items = [...(recon.criteria?.items ?? [])].sort((a, b) => a.rank - b.rank);

  return {
    name: recon.identity?.name ?? '',
    url: recon.source?.url ?? '',
    deadline: hard?.at ?? '',
    next_action_deadline: nextActionDeadline(recon.dates, now),
    tech: {
      required: (recon.tech?.required ?? []).map(techLabel),
      bonus: (recon.tech?.bonus ?? []).map(techLabel),
      forbidden: (recon.tech?.forbidden ?? []).map(techLabel),
    },
    criteria_ids: items.map((i) => i.id),
    tiebreak: recon.criteria?.tiebreak ?? 'unspecified',
    bonus_points_available: recon.bonus?.available ? (recon.bonus.max_points ?? 0) : 0,
    selected_track: null,
    recon_ref: rel(RECON_FILE),
    started_at: now.toISOString(),
  };
}

export function buildSubmissionDeliverables(recon) {
  return (recon.submission_requirements ?? [])
    .filter((r) => r.hard === true)
    .map((r) => ({ id: r.id, status: 'not_started' }));
}

/**
 * Merge freshly-seeded deliverables with whatever is already tracked. Re-running :recon
 * must never reset progress the user already made.
 */
function mergeDeliverables(existing = [], seeded = []) {
  const byId = new Map(existing.map((d) => [d.id, d]));
  return seeded.map((s) => byId.get(s.id) ?? s);
}

export async function applyRecon(root, recon, { now = new Date() } = {}) {
  const { valid, errors } = validateRecon(recon);
  if (!valid) {
    throw new Error(`refusing to apply an invalid recon payload:\n  ${errors.join('\n  ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  const files = [
    [RECON_FILE, `${JSON.stringify(recon, null, 2)}\n`],
    ['brief.md', renderBrief(recon)],
    ['rules.md', renderRules(recon)],
    ['criteria.md', renderCriteria(recon)],
  ];
  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }
  const artifacts = files.map(([name]) => rel(name));

  const next = {
    ...state,
    hackathon: buildHackathonDigest(recon, { now }),
    deliverables: {
      ...state.deliverables,
      submission_requirements: mergeDeliverables(
        state.deliverables?.submission_requirements,
        buildSubmissionDeliverables(recon),
      ),
      bonus_content: state.deliverables?.bonus_content ?? [],
    },
    phases: {
      ...state.phases,
      // The approval gate is at the phase exit: recon has produced its artifacts and
      // now waits on a human. :next refuses to advance past awaiting_approval.
      recon: { ...state.phases.recon, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts };
}
