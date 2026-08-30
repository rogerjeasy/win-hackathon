---
description: Audit required sponsor technology usage, forbidden technology, and submission requirements -- with file:line evidence, not a manifest guess
allowed-tools: Bash, Read, Task
---

Audit this project for compliance. Safe to run any time.

## Step 1 — Dispatch the checker

Dispatch the `compliance-checker` agent. It reads `stack.json`, `recon.json` and
`state.json`, then returns a JSON report. A dependency listed in `package.json` or any
other manifest is **never** accepted as evidence on its own -- only a real `file:line`
call site is.

## Step 2 — Apply

Write the agent's JSON report to `.hackathon/.tmp-compliance-report.json`, then run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs apply "$PWD" .hackathon/.tmp-compliance-report.json`

This overwrites `state.json.compliance` -- a fresh run always replaces the last one, it
never accumulates alongside it -- and prints the pass/fail board. The temp report file is
deleted after applying; nothing about a compliance run is a durable artifact.

## Step 3 — Report, don't gate

Show the user the pass/fail board. **This command does not stop at an approval gate** --
it is a repeatable audit, not a judgment phase. If anything is unverified or forbidden,
say so plainly and let the calling context (`:build`'s per-feature loop, or `:submit` in
M5) decide what to do about it.
