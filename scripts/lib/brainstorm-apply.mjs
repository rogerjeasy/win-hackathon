import { writeFile, mkdir, readdir, rename, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateIdeas } from './ideas-schema.mjs';
import { renderIdeas } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, IDEAS_FILE, RECON_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;
const ROUND_RE = /^ideas-round-(\d+)\.(md|json)$/;

/** One past the highest preserved round, so archiving never overwrites history. */
export async function nextRoundNumber(root) {
  let entries;
  try {
    entries = await readdir(path.join(root, HACKATHON_DIR));
  } catch {
    return 1;
  }
  const highest = entries.reduce((max, name) => {
    const m = name.match(ROUND_RE);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return highest + 1;
}

/** Move the current round aside so `--fresh` can start clean without losing anything. */
export async function archiveRound(root) {
  const dir = path.join(root, HACKATHON_DIR);
  const round = await nextRoundNumber(root);
  const moved = [];

  for (const [from, to] of [
    ['ideas.md', `ideas-round-${round}.md`],
    [IDEAS_FILE, `ideas-round-${round}.json`],
  ]) {
    try {
      await rename(path.join(dir, from), path.join(dir, to));
      moved.push(rel(to));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return moved.length === 0 ? { round: null, moved: [] } : { round, moved };
}

/**
 * Read recon.json if it exists, for cross-checking ideas against the real rubric.
 *
 * "Absent" and "corrupt" are not the same thing and must not be conflated: a genuinely
 * missing recon.json (ENOENT) means "no rubric available yet" and validateIdeas degrades
 * gracefully, reporting that fact through its warnings. But a recon.json that exists and
 * fails to parse is corrupt data on disk, not an absence — returning undefined for it would
 * make applyIdeas silently validate against no rubric at all, declare a payload valid, and
 * write it, when the truthful outcome is "we could not check the rubric because recon.json
 * is broken." That failure must be loud, not swallowed.
 */
async function readReconIfPresent(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, HACKATHON_DIR, RECON_FILE), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${path.join(root, HACKATHON_DIR, RECON_FILE)} could not be parsed as JSON`);
  }
}

/**
 * Apply a validated ideas payload: write ideas.json + ideas.md, advance the brainstorm
 * phase to awaiting_approval. This function only performs I/O — it never prints. Any
 * warnings validateIdeas produced (e.g. "no recon supplied") are returned on success, not
 * logged; the CLI decides how and whether to surface them. When the payload is invalid the
 * function throws instead of returning, so the warnings are attached to the thrown Error's
 * `warnings` property rather than lost — a payload frequently fails validation *because*
 * no recon was supplied (missing rubric checks), so that context must survive the throw.
 */
export async function applyIdeas(root, doc) {
  const recon = await readReconIfPresent(root);
  const { valid, errors, warnings } = validateIdeas(doc, recon);
  if (!valid) {
    const err = new Error(`refusing to apply an invalid ideas payload:\n  ${errors.join('\n  ')}`);
    err.warnings = warnings;
    throw err;
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  const files = [
    [IDEAS_FILE, `${JSON.stringify(doc, null, 2)}\n`],
    ['ideas.md', renderIdeas(doc, recon)],
  ];
  for (const [name, body] of files) await writeFile(path.join(dir, name), body, 'utf8');
  const artifacts = files.map(([name]) => rel(name));

  await writeState(root, {
    ...state,
    phases: {
      ...state.phases,
      brainstorm: {
        ...state.phases.brainstorm,
        status: 'awaiting_approval',
        artifacts,
        rounds: doc.round ?? 1,
      },
    },
  });

  return { artifacts, warnings };
}
