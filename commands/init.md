---
description: Set up (or adopt) win-hackathon in this project, never overwriting anything without your say-so
argument-hint: "[--dry-run]"
allowed-tools: Bash, Read, Edit, Write
---

Set up win-hackathon in the current project.

## Step 1 — Show the plan

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs "$PWD" --dry-run`

Show the user the plan verbatim. It names the detected mode (greenfield, adopt, resume,
or retrofit), every action, and which actions need approval.

If the user passed `--dry-run`, stop here.

## Step 2 — Get consent, file by file

Actions marked "needs your approval" touch files that already exist and that you did not
write. For each one:

- Show the user the file's current content (or the relevant part, if it is long).
- Explain exactly what will be added — always confined between
  `<!-- BEGIN:win-hackathon -->` and `<!-- END:win-hackathon -->`.
- Ask whether to proceed with that specific file.

Ask separately for each file. Never batch them into a single yes/no. Never assume a yes.
There is no force flag; if the user declines, that file is simply left alone and the rest
of init proceeds.

## Step 3 — Apply

Run init with the approved paths only:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs "$PWD" --apply --consent "<comma,separated,paths>"`

Omit `--consent` entirely if the user approved nothing — the unconsented actions will be
reported as skipped, which is correct behavior, not a failure.

## Step 4 — Report

Tell the user what was created, what was skipped and why, and where backups went. Then
suggest `/win-hackathon:next` to begin.

## Notes

- In **resume** mode the project is already set up; report the board and do not re-scaffold.
- In **retrofit** mode, phase statuses are backfilled from what is on disk. Say so plainly
  and suggest the user review them before running `:next`.
- If the worktree is dirty, mention it before writing anything.
