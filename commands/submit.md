---
description: Assemble the final Devpost submission -- README, demo runbook, form fields, video script, screenshot list -- from the built, deployed, reviewed application
allowed-tools: Bash, Read, Write, Task
---

Submit the application.

## Step 1 — Check the inputs exist

`.hackathon/review.json`'s `state.project.review.clean` must be `true`. If `:review` has
not reached a clean gate, this command refuses to assemble a submission around known-
blocking findings -- run `/win-hackathon:review` first and resolve every blocking finding.

## Step 2 — Re-check compliance

Run `/win-hackathon:check`. A required-tech regression introduced after `:ship` must be
caught here, not discovered by a judge.

## Step 3 — Dispatch the submission writer

Dispatch the `submission-writer` agent. It explores the actual built and deployed
application -- not just specs -- and returns `submission.json`. Write its JSON payload to
`.hackathon/submission.json`.

## Step 4 — Validate and render

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/submit.mjs apply "$PWD" --dry-run`

If it reports it would overwrite an existing file (most commonly `README.md`), say which
files before applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/submit.mjs apply "$PWD"`

This renders all five surfaces (`README.md`, `docs/DEMO_RUNBOOK.md`,
`.hackathon/submission.md`, `.hackathon/video-script.md`, `.hackathon/screenshots.md`) and
marks delivered items `done` in `state.deliverables`.

## Step 5 — The gate is not optional

**Refuse to declare completion while `requirementsComplete` (equivalently,
`state.project.submission.requirements_complete`) is `false`.** Show the user exactly which
hard submission requirements are still outstanding, from the command's own output. A
requirement can only be closed by actually delivering it, or by marking it `skipped` with a
rationale in `decisions.md` -- silence is not an acceptable reason to drop a hard
requirement.

## Step 6 — Stop at the gate

Once every hard requirement is `done` or `skipped`, the phase is `awaiting_approval`. Show
the user the rendered `README.md` and `.hackathon/submission.md`. Ask for approval.
