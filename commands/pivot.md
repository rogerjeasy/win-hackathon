---
description: Deadline triage -- propose a demoable core under time pressure, cutting only what a rubric criterion doesn't solely depend on
allowed-tools: Bash, Read
---

Triage scope under deadline pressure. This is a scope decision, not an automatic one --
it requires your explicit approval before anything changes.

## Step 1 — Propose

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/pivot.mjs propose "$PWD"`

This ranks not-yet-done must-have features safest-to-cut-first, using the same check for
sole claim on a judging criterion that `requirements-schema.mjs` already enforces at
write time. A feature that is the *only* one claiming some judging criterion is **never
proposed** — cutting it would guarantee a zero on a whole weighted axis, so it is listed
separately as protected, not silently hidden.

## Step 2 — Present and get approval

Show the user the full output: the time math, the proposed cuts, and the protected list.
**Requires an explicit yes before proceeding** — do not treat silence or a general "sounds
good" about the session as approval for a specific cut list.

## Step 3 — Apply only what was approved

For each approved FR-id:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/pivot.mjs apply "$PWD" <FR-id> [<FR-id> ...] -- "<rationale>"`

This appends to `state.json`'s `project.cut_features` and to `.hackathon/decisions.md`.
**`requirements.json`, the Gherkin, and the Kiro triad are never touched** — `:build` and
`:next` skip a cut feature by cross-referencing `cut_features`, not because the spec
folder changed shape underneath them.

## Step 4 — Report

Tell the user what was cut and where the rationale was recorded. Unlike every phase
command, `:pivot` sets no `awaiting_approval` gate of its own — the approval already
happened in Step 2, before anything was written.
