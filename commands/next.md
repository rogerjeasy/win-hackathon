---
description: Work out which phase comes next and start it — you never have to remember the order
allowed-tools: Bash, Read, Edit, Write, Task
---

Resolve and continue the hackathon workflow.

## Step 1 — Resolve

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/next.mjs "$PWD" --json`

## Step 2 — Act on the outcome

- **`init`** — there is no state here. Tell the user to run `/win-hackathon:init` first.

- **`drift`** — STOP. State claims a phase is approved but its artifacts are missing.
  Show exactly what disagrees and ask how to resolve it: restore the file, or reopen the
  phase. Never guess, and never silently re-run the phase.

- **`awaiting_approval`** — do NOT advance. Re-present that phase's artifact and ask for
  approval. On a yes, set the phase to `approved` with an `approved_at` timestamp. On
  requested changes, set it back to `in_progress` and make them.

- **`resume`** — continue the in-progress phase. The `reason` field carries the resume
  note describing where the previous session stopped. Pick up from there.

- **`start`** — announce the phase and begin it. Do not ask permission to start; the
  approval gate is at the phase's exit, and gating both ends costs the user an
  interaction for no added safety.

- **`complete`** — every phase is resolved. Suggest `/win-hackathon:check`.

## Step 3 — Deadline awareness

If `budget.total_hours` is set and the remaining time is less than the resolved phase's
budget, say so before starting and offer `/win-hackathon:pivot`.

## The governing rule

Run the obvious, stop on ambiguity.
