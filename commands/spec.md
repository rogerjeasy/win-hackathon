---
description: Turn requirements into per-feature specs — the Kiro triad and OpenSpec change proposals
allowed-tools: Bash, Read
---

Turn requirements into per-feature specs.

Load the `openspec-workflow` skill before starting.

## Step 1 — Confirm the input is approved

`:requirements` must have run and its phase must be approved. If it has not, stop and say
so — spec'ing against requirements that might still change wastes the work.

## Step 2 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs apply . --dry-run`

If it reports it would overwrite an existing `requirements.md`, `design.md` or `tasks.md`
under `.hackathon/specs/NNNN-<slug>/`, tell the user which files **before** applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/spec.mjs apply .`

## Step 3 — Explain what landed

For every must-have feature this writes one `.hackathon/specs/NNNN-<slug>/` folder holding
`requirements.md`, `design.md` and `tasks.md` — the Kiro triad. `design.md` is the slice of
the architecture M4's build agent reads for that feature; it does not read the full
`docs/architecture.md`. Alongside the triad, it also writes one OpenSpec change proposal per
must-have, under `openspec/changes/<slug>/proposal.md` — but that proposal depends on the
`@fission-ai/openspec` CLI being reachable, unlike the triad, which depends on nothing
external.

The triad is regenerated on every `:spec` apply — `tasks.md` included, which matters because
M4's build agent ticks its boxes off. Every triad file that already exists is copied to
`.hackathon/backups/<timestamp>/` before it is overwritten, so a previous run's checked-off
`tasks.md` is recoverable from there.

## Step 4 — Handle a deferred OpenSpec explicitly

If the script reports OpenSpec as DEFERRED, the CLI could not be reached — the proposals were
not written, but the Kiro triad was. Tell the user plainly that the other three surfaces are
complete, show them the command printed to run once the CLI is reachable, and treat the phase
as finishable, not blocked. A missing optional tool does not stop the phase from being
complete; the triad alone is enough for `:build` to proceed.

Note for whoever runs the command by hand later: the real package is `@fission-ai/openspec`.
The bare `openspec` name on npm is an unrelated squatted stub — never install or run that one.

## Step 5 — Stop at the gate

Show the user the folder list and, if OpenSpec was deferred, the note from Step 4. Ask
whether to proceed. **Do not continue to `:build` without an explicit yes.** The phase is
`awaiting_approval` and `:next` will not advance past it.
