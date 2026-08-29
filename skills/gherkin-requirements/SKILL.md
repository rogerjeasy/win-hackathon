---
name: gherkin-requirements
description: Use at :requirements — writing scenarios that are executable acceptance tests rather than decorative prose.
---

# Executable scenarios, not decorative prose

No project in the winner corpus used Gherkin. Two used the Kiro triad, one used numbered
FR-IDs with a test matrix. This skill is craft, not evidence — treat its advice as a
reasoned default rather than a proven pattern.

## Structured first

Scenarios live in `requirements.json` as `given`/`when`/`then` arrays, not in a `.feature`
file. The `.feature` files are rendered *from* that JSON, one per feature. Never hand-edit a
`.feature` file: the next `:requirements` run overwrites it from the payload again, and
whatever you changed by hand is gone with nothing left to show it was ever there. If a
scenario is wrong, fix it in `requirements.json` and re-run — the `.feature` file is output,
not source.

## What makes a scenario executable

A scenario earns the word "executable" only if someone could run it against the working
product and get a pass or fail, not just read it as a description of intent:

- **One behaviour per scenario.** A scenario that covers two behaviours can pass on the one
  that works and hide the one that doesn't.
- **Observable outcomes, not internal state.** Assert what a user or an API caller could see
  — a response, a record, a rendered value — not a variable only the implementation knows
  about.
- **Concrete values, not "valid data."** "the cart contains 2 units of SKU-104 at $12.50"
  gives a test something to construct; "valid data" gives it nothing.
- **No UI mechanics.** "the user clicks the blue button" breaks the day the button moves or
  changes colour. Name the action in terms of what it accomplishes instead.

## Given/When/Then discipline

- `given` describes state, not action — the world as it already is when the scenario starts,
  not a step that changes it.
- Exactly one `when`. A scenario with two triggers is two scenarios that got merged.
- `then` asserts only what this scenario is about. A `then` that also checks something an
  unrelated scenario already covers is duplicated effort that drifts the two apart over time.

## Tags that earn their place

A tag is only worth adding if something downstream reads it. `@must` and `@demo` are the
tags this plugin's later phases care about — a tag nothing reads is noise on the scenario,
not signal.

## Traceability

Every scenario names the FR it proves, via `requirement_ref`. That's why a failing test
points at the requirement it was written to prove, not just at a line number — the FR id
travels with the scenario into the rendered `.feature` file and stays attached all the way
through.
