# win-hackathon

[![release](https://img.shields.io/github/v/release/rogerjeasy/win-hackathon?label=release&color=blue)](https://github.com/rogerjeasy/win-hackathon/releases)
[![test](https://github.com/rogerjeasy/win-hackathon/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/rogerjeasy/win-hackathon/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2020-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
![JavaScript](https://img.shields.io/badge/JavaScript-ESM-F7DF1E?logo=javascript&logoColor=black)
![node:test](https://img.shields.io/badge/node%3Atest-920%20passing-3C873A)
![dependencies](https://img.shields.io/badge/dependencies-0-4C1)
![build step](https://img.shields.io/badge/build%20step-none-4C1)
![CI](https://img.shields.io/badge/CI-Node%2020%20%7C%2022%20%7C%2024-2088FF?logo=githubactions&logoColor=white)
![Markdown](https://img.shields.io/badge/Markdown-17%20commands%20%C2%B7%208%20agents%20%C2%B7%2023%20skills-000000?logo=markdown&logoColor=white)
![JSON](https://img.shields.io/badge/JSON-schema--validated-lightgrey?logo=json&logoColor=white)
![Bash](https://img.shields.io/badge/Bash-1%20wrapper-4EAA25?logo=gnubash&logoColor=white)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)

A Claude Code plugin that encodes an end-to-end hackathon workflow — from reading the
Devpost rules to submitting a deployed, documented, judge-ready project — as commands,
agents, skills, and hooks.

## Status

**v1.0.0 — complete. All five milestones are shipped and all eleven phases run end to
end**, with no further milestones planned. A Devpost URL goes in; a reviewed, deployed,
judge-ready submission — README, demo runbook, Devpost form draft, video script, and
screenshot shot-list — comes out, gated on a clean architecture-and-code review (zero
blocking findings) plus every hard submission requirement `done` or `skipped`. `npm test`
(`node --test`) runs the suite: **921 tests, 920 pass, 0 failures, 1 cleanly skipped** (the
Docker Compose milestone check, which needs Docker and this machine has none), green on
Node 20, 22, and 24. See [`CHANGELOG.md`](CHANGELOG.md) for what shipped in this release.

The full design lives in [`docs/design/win-hackathon-plugin.md`](docs/design/win-hackathon-plugin.md),
with the front half specified in [`docs/design/m2-front-half.md`](docs/design/m2-front-half.md),
the design half in [`docs/design/m3-design.md`](docs/design/m3-design.md), the build/ship
half in [`docs/design/m4-design.md`](docs/design/m4-design.md), and the close half in
[`docs/design/m5-design.md`](docs/design/m5-design.md).
[`docs/design/project-idea.md`](docs/design/project-idea.md) is the original sketch it supersedes,
kept for lineage.

Implementation is staged across five milestones; the plugin becomes genuinely usable from
M2 onward:

| Milestone | Contents | Usable after? |
|---|---|---|
| M1 — Spine | manifest, state schema, environment detection, `:init`, `:next`, `:status`, SessionStart hook | **Done** — infrastructure only, no phase commands yet |
| M2 — Front half | `:recon`, `:brainstorm`, `:describe` + ideation and scoring skills | **Done** — usable end to end |
| M3 — Design | `:stack`, `:architect`, `:requirements`, `:spec` + design and engineering skills | **Done** — covers everything up to writing code |
| M4 — Build & ship | `:build`, `:ship`, `:check`, `:pivot` + deploy skills | **Done** — a real deployed, sponsor-tech-compliant app comes out |
| M5 — Close | `:review`, `:submit`, `:log` + submission skills | **Done** — a reviewed, judge-ready submission comes out |

## The workflow

Eleven gated phases. Nothing advances without explicit approval.

`:recon` → `:brainstorm` → `:describe` → `:stack` → `:architect` → `:requirements` →
`:spec` → `:build` → `:ship` → `:review` → `:submit`

All eleven are implemented. You never need to remember that order — `:next` resolves it
from on-disk state.

## Install

```bash
/plugin marketplace add /path/to/win-hackathon
/plugin install win-hackathon
```

The git root is the plugin root deliberately: `/plugin marketplace add` expects
`.claude-plugin/` at the top level.

## Commands

| Command | What it does |
|---|---|
| `/win-hackathon:init [--dry-run]` | Sets up (or adopts) the workflow in this project. Never overwrites a file without a per-file yes; no `--force` flag exists. |
| `/win-hackathon:next` | Resolves which phase comes next from on-disk state and starts it. Reports drift when state and the filesystem disagree. |
| `/win-hackathon:status` | Phase board, time remaining, outstanding deliverables, unclaimed bonus points, missing tools. Changes nothing. |
| `/win-hackathon:recon <devpost-url>` | Reads the hackathon end to end — rules, rubric, deadlines, panel, bonus points — and writes the brief. |
| `/win-hackathon:brainstorm [--fresh] [--angle <name>]` | Generates ten ideas from four angles, gates them on Stage One, and scores the survivors against the real rubric. |
| `/win-hackathon:describe [--idea <id>] [--track <id>]` | Turns the chosen idea into the product case and the win strategy. |
| `/win-hackathon:stack` | Resolves the technology stack under sponsor-wins precedence — required tech first, personal defaults filling the gaps, every slot with a reason. |
| `/win-hackathon:architect` | Designs the system — architecture, data model, three diagram formats, and the `AGENTS.md` invariants — all rendered from one validated payload. |
| `/win-hackathon:requirements` | Turns the architecture into FR ids with acceptance criteria, a test matrix, and executable Gherkin scenarios. |
| `/win-hackathon:spec` | Turns requirements into per-feature specs — the Kiro triad, plus OpenSpec change proposals when the CLI is reachable. |
| `/win-hackathon:build [--feature <FR-id>]` | Implements the must-have features one at a time, TDD all the way via `superpowers:subagent-driven-development`, running `:check` after each one. |
| `/win-hackathon:check` | Audits required/forbidden sponsor technology with `file:line` evidence — never a manifest guess. Safe to run any time; does not gate. |
| `/win-hackathon:ship` | Picks a deploy target, writes Dockerfiles/Terraform/CI, actually deploys, and `curl`-verifies every URL before the gate. |
| `/win-hackathon:pivot` | Deadline triage — proposes a demoable core, ranked safest-to-cut-first, protecting any feature that solely claims a judging criterion. Requires explicit approval. |
| `/win-hackathon:review` | Runs `/code-review` and dispatches `quality-reviewer`, merges both into a validated `review.json`. Refuses to reach the gate while any finding is `blocking`; `should-fix`/`post-hackathon` findings never block. |
| `/win-hackathon:submit` | Re-runs `:check`, then dispatches `submission-writer` for a validated `submission.json` feeding all five judge-facing surfaces. Refuses the gate unless the review is clean and every hard submission requirement is `done` or `skipped`. |
| `/win-hackathon:log <text>` | Appends a timestamped entry to `challenges.md` — the manual path; agents write this file automatically too. |

Each command ends at an approval gate and stops — `:check`, `:pivot`, and `:log` are the
exceptions: `:check` is a repeatable audit with no gate of its own, `:pivot`'s only gate is
the approval it asks for directly in Step 2, and `:log` is a running log with no judgment
to gate.

## What M1–M5 produce

Working documents land in `.hackathon/`; judge-facing ones land in `docs/` and the repo
root later in the workflow.

| Phase | Artifacts |
|---|---|
| `:recon` | `recon.json`, `brief.md`, `rules.md`, `criteria.md` |
| `:brainstorm` | `ideas.json`, `ideas.md` — plus `ideas-round-N.*` when you re-run with `--fresh` |
| `:describe` | `project.md` (the product), `strategy.md` (how it wins) |
| `:stack` | `stack.json`, `stack.md` — every slot with a source (`required`/`default`/`bonus`) and a reason |
| `:architect` | `architecture.json`, `docs/architecture.md`, `docs/data-model.md`, plus `AGENTS.md`/`CLAUDE.md` at the repo root |
| `:requirements` | `requirements.json`, `requirements.md`, `requirements.feature` (executable Gherkin) |
| `:spec` | `specs/NNNN-<slug>/{requirements,design,tasks}.md` per must-have feature (the Kiro triad), plus `openspec/changes/<slug>/proposal.md` when the `@fission-ai/openspec` CLI is reachable |
| `:build` | Application source code, one must-have feature at a time — progress is read back from `[x]` checkboxes in that feature's own `tasks.md`, not tracked a second way in `state.json` |
| `:ship` | `deploy.json` — per-service target, Dockerfile, verified URL and verification method, plus the `infra/`/`.github/workflows/` files `deploy-engineer` writes alongside it |
| `:review` | `review.json`, `review.md` — merged `/code-review` + `quality-reviewer` findings, classified `blocking`/`should-fix`/`post-hackathon` |
| `:submit` | `submission.json` feeding five surfaces: `README.md`, `docs/DEMO_RUNBOOK.md`, `.hackathon/submission.md`, `.hackathon/video-script.md`, `.hackathon/screenshots.md` |

**Every judgment phase validates before it writes.** Each of `:recon`, `:brainstorm`, `:stack`,
`:architect`, `:requirements`, `:ship`, `:review`, and `:submit` emits a JSON payload that
must pass a schema first; every rendered surface — markdown, diagrams, the Kiro triad,
`deploy.json`, the five submission surfaces — comes from that payload, so nothing
downstream can drift from the source. Rules the schemas enforce because they lose
hackathons outright:

- Every date carries an explicit UTC offset. A floating `2026-06-29T17:00:00` is rejected.
- A disqualified idea is never scored — a number invites falling in love with an idea that
  cannot win.
- A rubric criterion no feature claims fails `:requirements` validation outright — it would
  otherwise score zero silently.
- A service marked `verified: true` in `deploy.json` must carry a real `verified_at` and
  `verification_method` — `:ship` does not gate on a deploy until every service it could
  verify has actually been `curl`-ed, not just configured.
- `:review` cannot reach `awaiting_approval` while any finding is `blocking` — mechanically
  enforced, not left as a reading of `review.md`.
- `:submit` cannot reach `awaiting_approval` unless `project.review.clean` is `true` and
  every hard `submission_requirements` item is `done` or `skipped`. (`/win-hackathon:submit`
  additionally asks, as a process convention rather than a schema check, that a `skipped`
  item get its own `decisions.md` entry — the same trail `:pivot` leaves for a cut feature.)

## Dependencies

These are requirements of the *workflow*, not of the plugin's own code:

- [`superpowers`](https://github.com/obra/superpowers) — `:build` invokes its SDD and TDD skills
- [`@fission-ai/openspec`](https://github.com/Fission-AI/OpenSpec) — optional for `:spec`.
  When the CLI is reachable it also gets one change proposal per must-have feature; when it
  isn't, `:spec` defers that step and still finishes with the Kiro triad it writes either way.
  Install the scoped name; the bare `openspec` package on npm is an unrelated stub.
- No Playwright/MCP dependency. `:recon` uses `WebFetch`; when a page is JS-gated or
  comes back thin it records the gap in `unresolved` and asks you to paste the page,
  rather than failing silently. See the design note in `docs/design/m2-front-half.md`.

## Releases

Not every push to `main` is a release — cutting one is a deliberate, separate act:

1. Add a `## [x.y.z] - YYYY-MM-DD` section to the top of [`CHANGELOG.md`](CHANGELOG.md)
   describing what changed.
2. Bump `version` in `.claude-plugin/plugin.json` and `package.json` to match.
3. Commit, then tag and push: `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.

Pushing the tag (not the commit itself) is what triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml): it re-runs the test
suite, pulls that version's section out of `CHANGELOG.md` via
`.github/scripts/release-notes.mjs`, and publishes the GitHub Release from it. The
workflow only listens for `v*` tag pushes, so ordinary commits to `main` never trigger it,
and it fails closed if the matching `CHANGELOG.md` section is missing or empty rather than
publishing a release with no notes.

## License

MIT
