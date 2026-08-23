import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderCriteriaMap, quoteBlock } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, RECON_FILE, IDEAS_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;
const byRank = (items = []) => [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

/**
 * Read and parse a required JSON file, distinguishing "absent" from "corrupt".
 *
 * A missing file (ENOENT) means the prerequisite phase never ran, so it fails with
 * `missingHint`, pointing at the command that would produce it. A file that exists but
 * fails to parse is corrupt data on disk, not an absence — collapsing that into the same
 * "run X first" message would be a lie (the file is right there) and would hide a real
 * problem behind a misleading fix. That failure must be loud and specific. Mirrors
 * `readReconIfPresent` in brainstorm-apply.mjs, which established this pattern.
 */
async function readJsonRequired(filePath, missingHint) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(missingHint);
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${filePath} could not be parsed as JSON`);
  }
}

/**
 * One submission heading per judging criterion. Devpost's seven default headings are the
 * baseline; anything else is an insertion, and insertions are what winners use to put
 * their strongest card where a skimming judge cannot miss it.
 */
export function buildHeadingPlan(recon) {
  const defaults = (recon.submission_form?.fields ?? [])
    .find((f) => f.id === 'about')?.default_headings ?? [];

  const SUGGESTED = {
    'technical-implementation': 'How we built it',
    design: 'Design decisions',
    impact: 'Impact',
    originality: 'What makes it original',
  };

  return byRank(recon.criteria?.items).map((c) => {
    const heading = SUGGESTED[c.id] ?? c.name;
    return { criterion_id: c.id, heading, inserted: !defaults.includes(heading) };
  });
}

export function buildBonusPlan(recon) {
  const b = recon.bonus;
  if (!b?.available) return [];
  const per = b.per_item_points || b.max_points || 0;
  const slots = per > 0 ? Math.round((b.max_points ?? 0) / per) : 0;
  return Array.from({ length: slots }, (_, i) => ({
    id: `bonus-${i + 1}`,
    status: 'not_started',
    kind: (b.kinds ?? [])[0] ?? null,
    platform: null,
    angle: null,
    url: null,
  }));
}

export function renderStrategySkeleton({ recon, idea }) {
  const out = [];
  const headings = buildHeadingPlan(recon);
  const bonus = recon.bonus;

  out.push(`# ${idea.name} — how we win`);
  out.push('');
  out.push(`For **${recon.identity?.name ?? 'this hackathon'}**. Track: \`${idea.track?.id ?? '?'}\`.`);
  out.push('');

  out.push('## The thesis');
  out.push('');
  // Free text sourced from the ideas file, not authored here — quoteBlock keeps an
  // embedded newline (or a line starting with #, -, or >) from escaping the blockquote.
  out.push(quoteBlock(idea.thesis));
  out.push('');
  out.push(`**Stated as an inversion:** ${idea.inversion}`);
  out.push('');
  out.push(
    'The thesis above is the single most load-bearing line in the submission — nearly every '
    + 'winner in the reference corpus states it as an inversion like this one. Promote it to a '
    + '**top-level heading high in the document** rather than burying it inside "How we built '
    + 'it": in the corpus, the projects that promoted it (Relay, HYPE, Sonar) each won '
    + '$10,000, while the one that buried it (Kintwadi) won a $2,000 category prize.',
  );
  out.push('');

  out.push('## Criteria map');
  out.push('');
  out.push('One row per judging criterion. Rows come from the rubric, so this table cannot drift from `criteria.md`.');
  out.push('');
  out.push(renderCriteriaMap(recon).trimEnd());
  out.push('');

  out.push('## Heading plan');
  out.push('');
  out.push('At least one submission heading per criterion. Insertions go beyond Devpost\'s defaults.');
  out.push('');
  out.push('| Criterion | Heading | Insertion? |');
  out.push('|---|---|---|');
  for (const h of headings) {
    out.push(`| \`${h.criterion_id}\` | ${h.heading} | ${h.inserted ? 'yes — added' : 'no — a Devpost default'} |`);
  }
  out.push('');

  out.push('## Track choice');
  out.push('');
  out.push(`Entered in \`${idea.track?.id ?? '?'}\`. ${idea.track?.ev_note ?? ''}`.trim());
  if (recon.prize_rules?.one_prize_per_project) {
    out.push('');
    out.push('Each project may win exactly one prize, so this is a single bet, not a hedge.');
  }
  if (recon.landscape?.gallery_available !== true) {
    out.push('');
    out.push(
      '_Crowding per track is unknown: Devpost galleries stay empty until winners are '
      + 'announced. This choice rests on prize structure and fit, not on observed field size._',
    );
  }
  out.push('');

  out.push('## The demo moment');
  out.push('');
  out.push(quoteBlock(idea.demo_moment));
  out.push('');
  out.push('Three-minute shot skeleton — fill in timings:');
  out.push('');
  out.push('1. **0:00–0:25 — the ache.** The problem, human, before any UI.');
  out.push('2. **0:25–1:30 — the product.** The happy path, ending on the demo moment above.');
  out.push('3. **1:30–2:15 — why it is safe and smart.** The engineering the judges are hired to notice.');
  out.push('4. **2:15–2:50 — the architecture.** Name the required technology out loud and say why this one.');
  out.push('5. **2:50–3:00 — the vision.** One number, one sentence.');
  out.push('');

  if (bonus?.available) {
    out.push('## Bonus contributions');
    out.push('');
    out.push(
      `Up to **+${bonus.max_points}** (${bonus.per_item_points} each), raising the ceiling to `
      + `**${bonus.max_score_with_bonus}**. Most entrants skip this.`,
    );
    out.push('');
    for (const slot of buildBonusPlan(recon)) {
      out.push(`- \`${slot.id}\` — _angle to be chosen_ · platform: _to be chosen_`);
    }
    out.push('');
    out.push(`**Required disclosure, verbatim:** ${bonus.required_disclosure}`);
    if (bonus.hashtag) out.push(`**Hashtag:** ${bonus.hashtag}`);
    out.push('');
  }

  out.push('## Risks and mitigations');
  out.push('');
  out.push('| Risk | Mitigation |');
  out.push('|---|---|');
  out.push('| _to be written_ | _to be written_ |');
  out.push('');

  return `${out.join('\n').trimEnd()}\n`;
}

function renderProjectOutline(idea) {
  return `# ${idea.name}

${quoteBlock(idea.pitch)}

## TL;DR

_The elevator pitch, in a paragraph a judge can read in twenty seconds._

## The problem — and why now

_Real stakes, a named audience, and what changed recently that makes this the moment._

## The insight

_Two extremes that exist today, and the underserved middle this occupies._

## Who it's for

| Persona | Who they are | What they need |
|---|---|---|
| _to be written_ | | |

## What it does

_Features grouped by pillar, not a flat list._

## A day in the life

_A narrative with **named characters**. These names are load-bearing: they become the
seeded demo data, the demo video script, and the submission narrative. Later phases reuse
them exactly._

## Product principles

_The design philosophy that makes this unmistakably for this audience._

## Limitations and what's out of scope

_Mandatory. These become the "What's next" section of the submission._
`;
}

export async function applyDescribe(root, { ideaId, trackId }) {
  const dir = path.join(root, HACKATHON_DIR);

  const recon = await readJsonRequired(
    path.join(dir, RECON_FILE),
    `no ${rel(RECON_FILE)} — run /win-hackathon:recon first`,
  );
  const ideasDoc = await readJsonRequired(
    path.join(dir, IDEAS_FILE),
    `no ${rel(IDEAS_FILE)} — run /win-hackathon:brainstorm first`,
  );

  const idea = (ideasDoc.ideas ?? []).find((i) => i.id === ideaId);
  if (!idea) {
    const wasRejected = (ideasDoc.disqualified ?? []).some((i) => i.id === ideaId);
    throw new Error(
      wasRejected
        ? `idea "${ideaId}" was disqualified at Stage One and cannot be built`
        : `no idea "${ideaId}" in ${rel(IDEAS_FILE)}`,
    );
  }

  const trackIds = (recon.tracks ?? []).map((t) => t.id);
  if (trackIds.length > 0 && !trackIds.includes(trackId)) {
    throw new Error(`track "${trackId}" is not one of: ${trackIds.join(', ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);

  await mkdir(dir, { recursive: true });
  const files = [
    ['project.md', renderProjectOutline(idea)],
    ['strategy.md', renderStrategySkeleton({ recon, idea: { ...idea, track: { ...idea.track, id: trackId } } })],
  ];
  for (const [name, body] of files) await writeFile(path.join(dir, name), body, 'utf8');
  const artifacts = files.map(([name]) => rel(name));

  // Re-running :describe (to change track, say) must not un-publish a bonus piece.
  const existingBonus = state.deliverables?.bonus_content ?? [];
  const byId = new Map(existingBonus.map((b) => [b.id, b]));
  const bonus = buildBonusPlan(recon).map((slot) => byId.get(slot.id) ?? slot);

  await writeState(root, {
    ...state,
    project: { ...state.project, name: idea.name, selected_idea: idea.id },
    hackathon: { ...state.hackathon, selected_track: trackId },
    deliverables: { ...state.deliverables, bonus_content: bonus },
    phases: {
      ...state.phases,
      describe: { ...state.phases.describe, status: 'awaiting_approval', artifacts },
    },
  });

  return { artifacts, bonusSlots: bonus.length };
}
