---
description: Pick a deploy target, write Dockerfiles/Terraform/CI, actually deploy, and verify every URL before the gate
allowed-tools: Bash, Read, Task
---

Ship the application.

## Step 1 — Check the inputs exist

`.hackathon/stack.json` must exist and be `approved`. If `:build` has not reached its own
gate, ask before shipping something unfinished — it is not this command's job to block
that outright, only to make sure the user is choosing it knowingly.

## Step 2 — Dispatch the deploy engineer

Dispatch the `deploy-engineer` agent. Tell it to start from
`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs suggest .` for a deterministic per-slot target
starting point before applying `deploy-targets`'s fuller judgment. It writes the infra
files itself, actually deploys, and `curl`s every URL — it does not stop at "the config
looks right."

## Step 3 — Validate, then preview and apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs apply . --dry-run`

If it reports it would overwrite an existing `deploy.json`, say which files before
applying. Then:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/ship.mjs apply .`

## Step 4 — A blocked deploy is not a failure to hide

If any service is not `verified: true` — missing CLI, missing auth, a failed build —
leave `phases.ship` at `in_progress` (do not run the apply above until every service the
agent could verify is verified), write a `resume_note` naming exactly what is blocking,
and tell the user what to run to unblock it. **A deploy that has not been fetched
successfully is not shipped.** Docker Compose is an acceptable target on its own, not only
a stopgap — degrading to it is a legitimate outcome, not a partial failure.

## Step 5 — Stop at the gate

Show the user every service's URL and verification status. Ask whether to proceed. **Do
not continue to `:review` (M5) without an explicit yes.**
