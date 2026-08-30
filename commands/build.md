---
description: Implement the must-have features, one at a time, TDD all the way, checking sponsor-tech compliance after each
allowed-tools: Bash, Read, Write, Edit, Task
argument-hint: "[--feature <FR-id>]"
---

Build the application.

## Step 1 — Find the next feature

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs status "$PWD" $ARGUMENTS`

This names the next must-have feature not yet fully checked off in its
`.hackathon/specs/NNNN-<slug>/tasks.md`, skipping anything in `state.json`'s
`project.cut_features` (set by `:pivot`). If it reports everything is done, skip to
Step 4.

## Step 2 — Assemble the context and hand off

Read the feature's `design.md`, `requirements.md` (from the same `specs/NNNN-<slug>/`
folder), its `features/<slug>.feature` Gherkin, `AGENTS.md`, and `.hackathon/stack.md`.

**Invoke the `superpowers:subagent-driven-development` skill with that feature's
`tasks.md` as the plan.** `tasks.md` is not background reading — it *is* the plan this
skill executes, checkbox by checkbox, each ending in `test → confirm-fails → implement →
suite → commit`, exactly as it was rendered.

Enforce `superpowers:test-driven-development` for every checkbox — this is already
implicit in how the tasks are written, but say so if a subagent tries to skip the
failing-test step.

**Do not read the OpenSpec change proposal for this feature** (the folder OpenSpec calls
`changes/<slug>/`). It is not part of this feature's build context — see
`docs/design/m4-design.md` §5 for why.

The Judge Quick-Start (a seeded, no-account demo path) is a build-time requirement. If
this is the last must-have feature, confirm it exists and responds before moving to
Step 3.

## Step 3 — Check compliance, then loop

Run `/win-hackathon:check`. If it reports a regression, fix it before starting the next
feature — a broken sponsor-tech claim is cheapest to fix the day it broke.

Return to Step 1.

## Step 4 — Close the gate

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/build.mjs gate "$PWD"`

If it reports something is still not done, go back to Step 1 for that feature.

## Step 5 — Stop at the gate

Show the user which features were built and the last `:check` result. Ask whether to
proceed. **Do not continue to `:ship` without an explicit yes.**
