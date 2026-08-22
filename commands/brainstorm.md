---
description: Generate ten project ideas from four angles, gate them on Stage One, and score the survivors against the real rubric
argument-hint: "[--fresh] [--angle <name>]"
allowed-tools: Bash, Read, Write, Task
---

Generate and rank ideas for this hackathon.

Load the `winning-ideation` and `sponsor-tech-thesis` skills before starting, and read
`skills/winning-ideation/references/winner-corpus.md` for calibration.

Requires an approved `:recon` — the rubric in `.hackathon/recon.json` is what everything is
scored against.

## Step 1 — Handle `--fresh`

If `--fresh` was passed, run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brainstorm.mjs archive "$PWD"`

This preserves the current round as `ideas-round-N.md` / `.json`. Nothing is overwritten and
nothing is lost. Then generate with **no knowledge of the previous round** — that is the
whole point of a fresh round, and re-reading the old one defeats it.

## Step 2 — Generate, four agents in parallel

Dispatch four `idea-generator` agents **in parallel**, one per angle:

- `technical-wow` — the demo that makes a judge lean forward
- `social-impact` — a real, nameable beneficiary
- `sponsor-native` — impossible without the required technology, not merely using it
- `underserved-niche` — a specific audience nobody builds for

If `--angle <name>` was passed, dispatch only that one.

Each returns candidates with a thesis, an inversion, and a demo moment. **Generators do not
score.**

## Step 3 — Score, in a fresh context

Dispatch one `idea-scorer` agent with all the candidates. It runs in a fresh context on
purpose: a generator scoring its own ideas rates enthusiasm rather than fit.

The order it works in is the point:

1. **The Stage-One gate first.** Theme fit and genuine use of required technology. Failures
   go to `disqualified` with reasons and **no scores** — a number on a non-compliant idea
   only makes it harder to let go of.
2. The inversion test, the thesis test, the demo moment.
3. Only then, per-criterion scoring, with ties broken by the rubric's rank order.

The agent writes `.hackathon/ideas.json` and validates it. Feed validation failures back at
most twice. If it still fails, stop and show the user the errors instead of running
apply — a third attempt is a loop, not a fix.

## Step 4 — Apply

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/brainstorm.mjs apply "$PWD"`

This renders `ideas.md` and sets the phase to `awaiting_approval`.

## Step 5 — Present, then stop

Show the shortlist, then go deeper on the top three: what each wins on, what it risks, and
the hour estimate against the remaining budget. Show the disqualified ideas too, with their
reasons — knowing why something was ruled out is worth as much as the ranking.

If every idea was disqualified, say so plainly and offer another round. That is a real
result, not a failed run.

Then ask the user to pick one idea, or request another round with `--fresh`. **Stop there.**
Do not start `:describe`.
