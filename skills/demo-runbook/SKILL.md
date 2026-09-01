---
name: demo-runbook
description: Reproducible walkthroughs -- the Judge Quick-Start (no account required) pattern, idempotent seed and reset, a golden-run fallback for a degrading live environment
---

# A runbook a judge can follow without you in the room

## Judge Quick-Start (no account required)

Its own top section, before anything else. Under one minute, no account, naming the exact
idempotent seed call. Karma's real runbook names this section exactly
`## Judge Quick-Start (no account required)` and states "under 1 minute, no Google account
needed" before the first numbered step -- ship that heading verbatim, it's load-bearing:
a judge grep-skimming for "how do I try this without signing up" finds it immediately.

## Full Manual Walkthrough

A second, slower path for anyone who wants the real end-to-end flow: numbered steps, each
ending in a stated "you should see" assertion. This is the path that actually exercises
the mechanism the Quick-Start shortcuts past.

## Troubleshooting

A symptom/fix table. Every entry should be something that actually happened during
development, not a hypothetical -- the table you'd have wanted while debugging your own
demo the night before submission.

## Golden-run / reset fallback

A live demo can degrade before judging ends -- a free-trial credential expiring, a
third-party service's quota resetting, a cloud account's budget alert firing. Karma's real
runbook has both a `reset-demo.sh` step and a separate `golden-run-snapshot.sh restore` for
exactly this: its README carries an explicit caveat that its Dynatrace trial tenant expires
on a fixed date, and the runbook's fallback is what keeps the demo reproducible after that.
Teach this as a general pattern, not a karma-specific note: any live external dependency
with a quota, trial window, or rate limit deserves a documented fallback path here, decided
before it becomes a problem during judging, not after.

## Reset

State the exact reset command. A demo a judge can't reset for the next reviewer isn't
reusable across a judging panel.
