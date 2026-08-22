---
name: devpost-recon
description: Use when reading a Devpost hackathon page to extract rules, criteria, deadlines and requirements — covers page anatomy, where requirements actually hide, and what to quote verbatim.
---

# Reading a Devpost hackathon

The rules page is not where most of the decisive information lives.

## Page anatomy

| Page | What only it has |
|---|---|
| `/` | Prizes and tracks with cash values, the judging panel, participant count, the criteria in summary |
| `/rules` | Dates with timezones, eligibility exclusions, submission requirements, tie-breaking, bonus mechanics, IP terms |
| `/resources` | Sponsor and partner sections, and the FAQ |
| `/updates` | Host clarifications posted after launch — **these outrank the original rules text** |
| `/project-gallery` | Nothing, during a live hackathon. See below. |

## The two places requirements hide

**Partner and sponsor sections on `/resources`.** These read like documentation and
function like requirements. A sponsor listing the exact span attributes their dashboard
expects has just told you what a judge will check for. Extract them with a verbatim quote —
a finding that can be traced to the host's own words is the one that survives an argument.

**The FAQ.** Hosts routinely put rubric language there that never appears on the rules
page: what will score poorly, what a diagram should contain, how AI-assisted code will be
treated. Capture it in `host_guidance` verbatim.

## The gallery is empty and that is not a bug

Devpost project galleries stay **empty until winners are announced**. During the
submission period you cannot see how many people entered a track, so per-track crowding is
unobservable. Record `gallery_available: false`, leave `entries_observed` null, and do not
substitute the participant count — that counts registrations, most of which never submit.

If the hackathon is one edition of a recurring series, the *prior* edition's gallery is
populated and is the single richest page available to you: winners, their pitches, and
often the one-line technology thesis each used.

## Dates are not one date

Separate three kinds:

- **`hard`** — the submission deadline. Exactly one.
- **`action`** — a cut-off with its own earlier date that costs a resource if missed:
  credit request forms, registration windows, credit expiry. These are missed constantly
  because everyone is watching the big number.
- **`informational`** — judging period, winner announcement.

Every one gets an **explicit UTC offset**. Prose like "June 29, 2026 (5:00 pm Pacific
Time)" becomes `2026-06-29T17:00:00-07:00`. Watch the date line: a deadline displayed as
"Jun 30 @ 2:00am GMT+2" is the same instant as "Jun 29 5:00pm PT."

## Extract verbatim, summarise never

Quote, don't paraphrase, for: every judging criterion, every hard submission requirement,
the Stage-One language, the tie-breaking rule, the bonus mechanics, and the eligibility
exclusions. Everything else may be summarised.

## Ambiguities are actionable

Rules contain copy-paste errors — a prize table that lists the B2B second-place prize as
open to B2C entries, for example. When you find one, record the passage, the likely
reading, and the remedy: most Devpost rules explicitly invite a written request for
clarification before the deadline. Flagging it is worth more than silently assuming.

## Never guess

Anything you cannot determine goes into `unresolved` as a plain sentence. Recon completes
with open questions; it does not complete with invented answers.
