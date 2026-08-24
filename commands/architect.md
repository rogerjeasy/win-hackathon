---
description: Design the system — architecture, data model, diagrams, invariants and the agent contract
allowed-tools: Bash, Read, Write, Task
---

Design the system.

## Step 1 — Check the inputs exist

`.hackathon/stack.json` must exist and its phase must be approved. If `:stack` has not run,
stop and say so — designing against an undecided stack wastes the design.

## Step 2 — Dispatch the architect

Dispatch the `solution-architect` agent. It writes `.hackathon/architecture.json` and nothing
else. Do not design in this conversation — the exploration is large and none of it is needed
after the payload exists.

## Step 3 — Validate

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs validate .hackathon/architecture.json`

Send the whole error list back to the agent. **At most two retries**, then stop and show the
user.

## Step 4 — Preview, then apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs apply . --dry-run`

If it reports it would overwrite an existing `AGENTS.md` or `CLAUDE.md`, tell the user which
files and what is in them **before** applying. Then:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/architect.mjs apply .
```

Everything is backed up under `.hackathon/backups/<timestamp>/` first, and hand-written
content outside the managed blocks is preserved.

## Step 5 — Stop at the gate

Show the user the Mermaid diagram, the component legend and the numbered invariants. Say
plainly if `AGENTS.md` came out short — a project with no tenancy story *should* have few
invariants, and Sonar won first place with a five-line `AGENTS.md`. A padded list is worse
than a short one.

Ask whether to proceed. **Do not continue to `:requirements` without an explicit yes.**
