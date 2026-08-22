---
name: winning-ideation
description: Use when generating or evaluating hackathon project ideas — the angles that win, the anti-patterns that lose, and the inversion, demoability and quantification tests.
---

# Generating ideas that can actually place first

The evidence base for everything here is `references/winner-corpus.md` — twelve winning
submissions across three hackathons, six of them from a single hackathon so the placement
differences are readable. Read it when calibrating; don't rely on recall.

## Four angles, run in parallel

One agent producing ten ideas converges on a house style. Four agents with different
angles diverge, which is the point.

- **technical-wow** — the demo that makes a judge lean forward, with a hard engineering
  spine underneath.
- **social-impact** — a real, nameable beneficiary and stakes that matter.
- **sponsor-native** — impossible without the required technology, not merely using it.
- **underserved-niche** — a specific audience nobody builds for.

## The three tests

**The inversion test.** Every winner in the corpus can be stated as "X, not Y" in one
sentence: the model goes to the data, not the data to the model; authorization lives in the
database, not the UI; vision is the last resort, not the first tool. If you cannot write
that sentence, the idea is not finished. This is the Originality criterion made mechanical.

**The thesis test.** One line on why *this* required technology, phrased so a competitor
using a different technology could not claim it. See `sponsor-tech-thesis`.

**The demoability test.** Name the single visceral thing a judge sees inside three minutes.
Kintwadi's is an aide's view blocked from a financial document, captioned "blocked by the
database, not the UI." If the demo moment is "a dashboard loads," there isn't one.

## Quantify

Every winning pitch in the corpus carries a number — market size, latency, a count of the
thing built, a population figure. It is the cheapest credibility available, and its absence
is conspicuous.

## Anti-patterns

Todo apps. Thin chatbot wrappers over documents. "X, but with AI." Anything whose whole
description is a prompt plus a UI. Ideas in categories with ten funded companies where you
add nothing. Note what the corpus contains instead: in-database federated learning, a
dual-database access-pattern split, an optimistic-concurrency ledger with a public solvency
proof. There is always a hard spine.

## Scope to the hours you actually have

An idea that cannot reach a working vertical slice is worth less than a narrower one that
can. Estimate hours per idea and treat a number well past the budget as a scoring input,
not a detail — the corpus rewards depth in one direction over breadth in six.

## Generation and scoring are separate jobs

Generate without scoring. Score in a fresh context, by an agent that did not generate. A
generator rating its own ideas rates enthusiasm.
