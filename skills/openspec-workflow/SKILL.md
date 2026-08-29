---
name: openspec-workflow
description: Use at :spec — driving the @fission-ai/openspec CLI: proposal structure, validation, and what to do when the CLI is unreachable.
---

# Driving the OpenSpec CLI

No project in the winner corpus used OpenSpec. This skill is craft, not evidence — treat its
advice as a reasoned default rather than a proven pattern.

## The package trap

The real package is `@fission-ai/openspec`. The bare `openspec` name on npm is an unrelated
squatted `0.0.0` stub — it installs, it runs, and it does nothing useful, with no error to
tell you that's what happened. Always invoke it as `npx --yes @fission-ai/openspec`, spelled
out in full, every time. Never the bare name, and never assume a locally installed `openspec`
binary is the right one.

## Proposal structure

Each must-have feature gets one proposal, `openspec/changes/<slug>/proposal.md`, generated
from `requirements.json`. It has three sections:

- **Why** — the user story, restated as the need the feature exists to meet
- **What changes** — the components this feature touches, drawn from `component_refs`
- **Verification** — the scenario ids that prove it, pointing at `features/<slug>.feature`

A proposal is regenerated in full on every `:spec` run. A hand edit to `proposal.md` is lost
the same way a hand edit to a `.feature` file is: fix the source (`requirements.json`) and
re-run — never the rendered file.

## `init` runs only when needed

`openspec init` runs only when `openspec/` is not already present in the project. If it's
already there — from an earlier `:spec` run, or from before this plugin touched the project
— `init` is skipped and the existing directory is left alone.

## The deferred path

A phase whose own outputs are complete must not fail because an optional external tool
couldn't be reached. If OpenSpec is unreachable — offline, registry failure, install refused
— `:spec` still writes everything that doesn't depend on the CLI, reports what it could not
do, names the exact command to run later, and lets the phase finish rather than blocking it.

The shipped output, verbatim:

```
OpenSpec: DEFERRED          (or "OpenSpec: DRY RUN" during a dry run)
  <openspec.reason>
  Run this when the CLI is reachable: <openspec.command>   (or "Would run: ..." on a dry run)
```

`<openspec.command>` is always `npx --yes @fission-ai/openspec validate`. Report the
deferral, show that command, and move on — a deferred OpenSpec is not a failed `:spec`.

## Archiving is out of scope

Proposals get archived once M4 has implemented the feature they describe. That's M4's job,
not this one: `:spec` writes and validates proposals; it does not archive them.
