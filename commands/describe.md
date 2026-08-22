---
description: Turn the chosen idea into the product case and the win strategy — project.md and strategy.md
argument-hint: "[--idea <id>] [--track <track-id>]"
allowed-tools: Bash, Read, Write, Edit
---

Write up the selected idea.

Load the `project-description` and `sponsor-tech-thesis` skills before starting.

Requires an approved `:brainstorm`. If no `--idea` was passed, read `.hackathon/ideas.json`
and ask which one — never assume the top-ranked idea was the one chosen.

## Step 1 — Settle the track

A project may usually enter only **one** track, so this is a single bet rather than a hedge.
Show the tracks with their prizes and the idea's `ev_note`, and ask.

Be honest about what you don't know: during a live hackathon the project gallery is empty,
so per-track crowding is unobservable. Choose on prize structure and fit, and say that is
what you are doing.

## Step 2 — Scaffold

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/describe.mjs apply "$PWD" --idea <id> --track <track-id>`

This writes `.hackathon/project.md` (an outline) and `.hackathon/strategy.md` (the criteria
map, heading plan, demo skeleton and bonus plan, rendered from the rubric), seeds the
bonus-content deliverables, and sets the phase to `awaiting_approval`.

## Step 3 — Write the prose

Fill in `project.md` against its section spine. Two things carry more weight than they look:

**"Why now."** What changed recently that makes this the moment. It is what separates a
product from a project.

**The named characters in "a day in the life."** These are load-bearing. In the entry that
won, the same four people became the seeded demo data, the demo video script, and the
submission narrative — one decision, three deliverables. Name them deliberately, give them a
geography that carries the point of the product, and expect every later phase to reuse those
exact names.

Then complete `strategy.md`: fill the "how it wins" column of the criteria map, choose the
angle and platform for each bonus slot, and write the risks table. Do not edit the criteria
rows themselves — they are rendered from the rubric so they cannot drift from `criteria.md`.

## Step 4 — Present, then stop

**Read the thesis aloud first.** One sentence on why this technology, that a competitor
using something else could not claim. Everything downstream depends on it: `:architect` has
to earn it, `:submit` leads with it. If it doesn't survive being said out loud, fix it now
rather than after the architecture is built around it.

Then walk through the criteria map, the heading plan — noting which headings are insertions
beyond the Devpost defaults and why the thesis is promoted to a top-level heading — the demo
moment, and the bonus plan.

Ask for approval and **stop**. Do not proceed to `:stack`.
