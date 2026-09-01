---
name: demo-video-script
description: Sub-three-minute video structure -- hook, problem, demo, technical depth, close -- each shot with a timing budget, checked against the platform's own video requirements
---

# A video script that fits the clock and the rules

## Structure

Five beats, in order: **hook** (the problem, sharply stated) → **problem** (who it's for,
why it matters) → **demo** (the app actually working -- the largest share of the runtime)
→ **technical depth** (the thing a technical judge needs to see, e.g. the real
sponsor-tech call site) → **close** (name, tagline, live URL).

## Every shot gets a timing budget, summing to the cap

Devpost-class rules typically cap the video at three minutes (180 seconds) --
`submission-schema.mjs`'s `validateSubmission` enforces this mechanically, not just as
advice. Write each shot's `seconds` deliberately, not as an afterthought: the demo beat
should be the largest single allocation, since "judges may choose to judge based solely on
the text description, images, and video" makes the video's demo footage some of the
highest-leverage seconds in the whole submission.

## Check the platform's own video requirements as a checklist, not an afterthought

The rules typically require more than "make a video" -- e.g. "must state the AWS Database
used," "must be uploaded to YouTube and made publicly visible." Read
`recon.json.submission_requirements` for every video-related hard requirement and write
each one into a specific shot, then verify after editing that the shot actually says it --
a script that satisfies the structure above but skips a named requirement is not done.
