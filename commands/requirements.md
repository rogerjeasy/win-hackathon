---
description: Turn the architecture into verifiable features — FR ids, acceptance criteria and Gherkin scenarios
allowed-tools: Bash, Read, Write
---

Turn the architecture into verifiable requirements.

Load the `gherkin-requirements` skill before starting.

## Step 1 — Read the inputs

Read `.hackathon/architecture.json` (the components and invariants), `.hackathon/strategy.md`
(the thesis and the demo moment) and `.hackathon/recon.json` (the judging rubric).

## Step 2 — Write one feature per thing the product actually does

Each feature claims the rubric criteria it serves, via `criterion_refs`. Check this both
ways: every feature's criteria should be real, and — the direction that is easy to miss —
every criterion the rubric scores should be claimed by at least one feature. **A criterion no
feature claims will score zero**, and the validator will reject a payload that leaves one
unclaimed. Write toward the rubric in each direction, not just one.

## Step 3 — Give every must-have a scenario

Every `must` priority feature needs at least one scenario with concrete Given/When/Then
steps — written so it could be executed against the running product, not merely read as a
description of intent.

## Step 4 — Flag the demo moment

Exactly one feature is the demo moment `strategy.md` names — set `demo_moment: true` on it,
and nowhere else.

## Step 5 — Write and validate

Write `.hackathon/requirements.json`, then run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs validate .hackathon/requirements.json`

The script prints every problem at once. Fix them all, then re-run. **At most two retries** —
a third is a loop, not a fix, so stop and show the user the errors.

## Step 6 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs apply . --dry-run`

If it reports it would overwrite an existing `.hackathon/requirements.md` or
`.hackathon/requirements.json`, tell the user **before** applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/requirements.mjs apply .`

This writes `.hackathon/requirements.json`, `.hackathon/requirements.md`, and one
`features/<slug>.feature` per feature. The first two are backed up under
`.hackathon/backups/<timestamp>/` before being overwritten; the `.feature` files are not —
regenerating them on every run is the intended contract, so never hand-edit one. If a
`.feature` file from a previous run is no longer in the requirements, the script reports it
under `Left in place:` rather than deleting it — never hand-editing one is the rule, but the
script will not destroy evidence that someone broke it, so a file it no longer regenerates is
kept in case the user had edited it before it was dropped.

## Step 7 — Stop at the gate

Show the user the criteria-coverage table and the Definition of Done from
`requirements.md`. Ask whether to proceed. **Do not continue to `:spec` without an
explicit yes.** The phase is `awaiting_approval` and `:next` will not advance past it.
