---
name: devpost-submission
description: Mapping artifacts to Devpost form fields, organized by the platform's own form steps; the requirements tracker; what the challenges log is for
---

# Writing to the form, not around it

## Organize by the platform's own form steps, not your own headings

Kintwadi's real working doc for this opens: "Master working doc for the Devpost submission
form. Fill each form step from the matching section below." Mirror that structure exactly
-- one section per field the form actually has (`recon.json.submission_form.fields[]`),
in the order the form presents them. A submission doc organized by your own preferred
headings makes copy-paste into the actual form a translation exercise; organized by the
form's own steps, it's a direct paste.

## Paste-ready, with the limit verified

Every field's text should already respect the form's own character limit
(`recon.json.submission_form.fields[].limit`), not need trimming at paste time. When a
field has room to spare, a short alternatives table with a stated recommendation and
rationale -- kintwadi's real doc does this for its project name and elevator pitch, each
verified to the character -- helps a human make the final call quickly rather than staring
at a blank field under deadline pressure.

## Challenges we ran into, verbatim

Assemble this field from `.hackathon/challenges.md` directly, not paraphrased. That file
exists so this field can be written from what actually happened while it's still fresh
(Rule 2) -- entries like "a stray `{service_id}` in a prompt raised a `KeyError`" carry
more weight with a judge than "time management was hard," and paraphrasing risks losing
exactly that specificity.

## Requirements tracker

A checklist synced from `state.deliverables.submission_requirements` (the hard, gating
items `:recon` seeded) plus `.bonus_content`. This is not a nice-to-have -- kintwadi's real
submission doc has a literal "Submission requirements tracker (from the official 'What to
submit')" section, and a requirement silently missing from a tracker like this is exactly
how a required field gets forgotten at the actual submission deadline.
