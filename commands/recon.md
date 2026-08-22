---
description: Read a Devpost hackathon end to end — rules, rubric, deadlines, panel, bonus points — and write the brief
argument-hint: "<devpost-url>"
allowed-tools: Bash, Read, Write, Task
---

Ingest the hackathon at `$ARGUMENTS`.

Load the `devpost-recon` and `judging-criteria-scoring` skills before starting.

## Step 1 — Dispatch the recon agent

Dispatch the `hackathon-recon` agent with the URL. It fetches `/`, `/rules`, `/resources`,
`/updates` and `/project-gallery`, and writes `.hackathon/recon.json`.

Do not fetch the pages yourself. Raw Devpost markup is enormous and must not enter this
conversation — that is the entire reason the agent exists.

**On the gallery:** Devpost project galleries stay empty until winners are announced, so
per-track crowding is not observable during a live hackathon. If the agent reports a
crowding number for a live hackathon, that number is invented — reject it. For a recurring
series the agent reads the *prior* edition's gallery instead, which is populated.

## Step 2 — Validate, and feed failures back

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/recon.mjs validate .hackathon/recon.json`

On failure the script prints every problem at once. Send that whole list back to the agent
and let it fix the payload. **Do this at most twice.** If it still fails, stop and show the
user the errors — a third attempt is a loop, not a fix.

**Never guess.** Never hand-edit the payload to make validation pass. If a field cannot be
determined, it belongs in `unresolved`, not filled in with a plausible guess.

## Step 3 — Apply

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/recon.mjs apply "$PWD"`

This writes `brief.md`, `rules.md` and `criteria.md`, populates `state.json.hackathon`,
seeds the submission-requirement deliverables, and sets the phase to `awaiting_approval`.

## Step 4 — Ask about the budget

Ask how many hours are realistically available between now and the deadline, and write it
to `budget.total_hours` in `.hackathon/state.json`. This is what later phases use to decide
whether a scope is achievable.

## Step 5 — Present, then stop

Show the user, in this order:

1. **The rubric** — every criterion, and which one breaks ties. If ties break on listed
   order, say plainly that equal weighting does not mean equal value.
2. **The deadlines** — the submission deadline, and separately every dated action that
   closes earlier. Credit request forms are missed constantly because everyone watches the
   big number.
3. **Required technology** — non-negotiable, and what it excludes.
4. **The panel read** — who the judges are and what that means for what to lead with.
5. **Bonus points** — the real score ceiling, and what claiming them requires.
6. **Ambiguities and unresolved items** — recite these explicitly. Never bury them. An
   ambiguity in the rules usually comes with a remedy the rules themselves provide.
7. **Eligibility exclusions** — check these against the user's own situation before they
   spend an hour building.

Then ask for approval and **stop**. Do not start the next phase. The phase is
`awaiting_approval` and `:next` will refuse to advance until the user decides.
