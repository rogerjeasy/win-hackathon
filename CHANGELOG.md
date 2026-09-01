# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are cut deliberately —
not every push to `main` is a release; a version only appears here when a `vX.Y.Z` tag is
pushed, which is what triggers the GitHub Release (see `.github/workflows/release.yml`).

## [1.0.0] - 2026-09-01

First tagged release. All five milestones (M1–M5) are complete and the eleven-phase
workflow runs end to end: a Devpost URL goes in, and a reviewed, deployed, judge-ready
submission comes out.

### Added

- The full phase sequence as gated slash commands: `:init`, `:next`, `:status`, `:recon`,
  `:brainstorm`, `:describe`, `:stack`, `:architect`, `:requirements`, `:spec`, `:build`,
  `:check`, `:ship`, `:pivot`, `:review`, `:submit`, `:log` — 17 commands.
- 8 agents: `hackathon-recon`, `idea-generator`, `idea-scorer`, `solution-architect`,
  `deploy-engineer`, `compliance-checker`, `quality-reviewer`, `submission-writer`.
- 23 skills covering recon, ideation, architecture, deployment, and submission writing.
- A validated JSON contract behind every judgment phase (`recon.json` through
  `submission.json`), with every rendered markdown/diagram/config surface generated from
  that payload so nothing downstream can drift from the source.
- State schema v5, with automatic migration from any earlier version.
- Zero runtime dependencies. `node --test` suite: 921 tests, 920 passing, 1 cleanly
  skipped (a Docker-dependent check on machines without Docker), green on Node 20, 22,
  and 24 in CI.

[1.0.0]: https://github.com/rogerjeasy/win-hackathon/releases/tag/v1.0.0
