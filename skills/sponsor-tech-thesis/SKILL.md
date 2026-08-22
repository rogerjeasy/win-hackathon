---
name: sponsor-tech-thesis
description: Use when deciding or writing the one-line justification for a hackathon's required technology — the form it takes, where to place it in a submission, and how to avoid claiming more than the architecture supports.
---

# The technology thesis

One sentence saying why *this* technology, phrased so that a competitor using a different
technology could not claim it.

"We used Aurora PostgreSQL" is not a thesis; it is a fact. "Caregiving is relational,
transactional and access-controlled, so authorization belongs in the database — a key-value
store cannot enforce it" is a thesis: it names a property of the domain, connects it to a
property of the engine, and excludes the alternative.

## The form

Every winner in `../winning-ideation/references/winner-corpus.md` has one, and they share a
shape — an inversion that names the excluded alternative:

- Sammy: the model is stored inside Aurora and inference runs in the VPC, so "nothing ever
  leaves that private network boundary" — the model goes to the data, not the data to the model.
- Sonar: "DynamoDB for speed, Aurora DSQL for record" — the database is chosen by the access
  pattern, not the data model.
- Waylo: four cheaper detection layers first, so "Nova only fires as a genuine last resort."
- Relay: Aurora DSQL for multi-region active-active writes and strong consistency on
  irreversible actions.

Write it as: **[property of the domain] → [property of this engine] → [what the alternative
cannot do].**

## Placement decides how many judges read it

This is the finding the skill exists for.

Kintwadi's thesis — "the database is the thesis, not a default" — is as strong as any in the
corpus. It sits inside "How we built it," several screens down. It won Best Design, $2,000.

Relay put "Which AWS Database — and why Aurora DSQL" at **section three**, ahead of "How we
built it." HYPE gave the argument two top-level headings. Sonar renamed a default heading
around it: "How we built it — the data model is the product." Each won a $10,000 track
first place.

**Promote the thesis to a top-level heading, high in the document.** Same argument, more
readers, different prize.

## Where it is used

- **`:brainstorm`** — every candidate is scored on whether a thesis can be written for it at
  all. An idea with no thesis will not survive the Stage-One "reasonably applies the required
  APIs" gate either.
- **`:describe`** — the thesis is written into `strategy.md` and the heading plan promotes it.
- **`:architect`** — the architecture must actually earn it. This is the phase where the
  claim becomes a constraint.
- **`:submit`** — the README and the Devpost description lead with it, and the demo video
  says it out loud.

## The failure mode

A thesis the architecture does not support is worse than none, because judges on a sponsor
panel are hired to notice exactly this. If the submission claims the database enforces
authorization, there must be policies in the schema and a test proving cross-tenant
isolation. If it claims a cheaper path runs first, there must be measurements.

Write the thesis at `:describe`, then treat it as a bill the build has to pay. If by
`:review` the architecture cannot cash it, change the thesis to what is true — a smaller
honest claim scores better than a large one a judge can puncture in thirty seconds.
