# win-hackathon

[![test](https://github.com/rogerjeasy/win-hackathon/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/rogerjeasy/win-hackathon/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2020-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
![JavaScript](https://img.shields.io/badge/JavaScript-ESM-F7DF1E?logo=javascript&logoColor=black)
![node:test](https://img.shields.io/badge/node%3Atest-344%20passing-3C873A)
![dependencies](https://img.shields.io/badge/dependencies-0-4C1)
![build step](https://img.shields.io/badge/build%20step-none-4C1)
![CI](https://img.shields.io/badge/CI-Node%2020%20%7C%2022%20%7C%2024-2088FF?logo=githubactions&logoColor=white)
![Markdown](https://img.shields.io/badge/Markdown-6%20commands%20%C2%B7%203%20agents%20%C2%B7%205%20skills-000000?logo=markdown&logoColor=white)
![JSON](https://img.shields.io/badge/JSON-schema--validated-lightgrey?logo=json&logoColor=white)
![Bash](https://img.shields.io/badge/Bash-1%20wrapper-4EAA25?logo=gnubash&logoColor=white)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)

A Claude Code plugin that encodes an end-to-end hackathon workflow — from reading the
Devpost rules to submitting a deployed, documented, judge-ready project — as commands,
agents, skills, and hooks.

## Status

**M2 (Front half) complete.** A Devpost URL goes in; a validated brief, a scored idea
shortlist, and a written win strategy come out. On top of M1's spine, this adds the
`/win-hackathon:recon`, `:brainstorm`, and `:describe` commands, state schema v2 with
migration from v1, three agents, and five skills. `npm test` (`node --test`) runs the
suite: **344 tests, 0 failures**.

The full design lives in [`docs/design/win-hackathon-plugin.md`](docs/design/win-hackathon-plugin.md),
with the front half specified in [`docs/design/m2-front-half.md`](docs/design/m2-front-half.md).
[`docs/design/project-idea.md`](docs/design/project-idea.md) is the original sketch it supersedes,
kept for lineage.

Implementation is staged across five milestones; the plugin becomes genuinely usable from
M2 onward:

| Milestone | Contents | Usable after? |
|---|---|---|
| M1 — Spine | manifest, state schema, environment detection, `:init`, `:next`, `:status`, SessionStart hook | **Done** — infrastructure only, no phase commands yet |
| M2 — Front half | `:recon`, `:brainstorm`, `:describe` + ideation and scoring skills | **Done** — usable end to end |
| M3 — Design | `:stack`, `:architect`, `:requirements`, `:spec` + design and engineering skills | Yes |
| M4 — Build & ship | `:build`, `:ship`, `:check`, `:pivot` + deploy skills | Yes |
| M5 — Close | `:review`, `:submit`, `:log` + submission skills | Complete |

## The workflow

Eleven gated phases. Nothing advances without explicit approval.

`:recon` → `:brainstorm` → `:describe` → `:stack` → `:architect` → `:requirements` →
`:spec` → `:build` → `:ship` → `:review` → `:submit`

The first three are implemented; the rest land in M3–M5. You never need to remember that
order — `:next` resolves it from on-disk state.

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

Each command ends at an approval gate and stops.

## What the front half produces

Working documents land in `.hackathon/`; judge-facing ones land in `docs/` and the repo
root later in the workflow.

| Phase | Artifacts |
|---|---|
| `:recon` | `recon.json`, `brief.md`, `rules.md`, `criteria.md` |
| `:brainstorm` | `ideas.json`, `ideas.md` — plus `ideas-round-N.*` when you re-run with `--fresh` |
| `:describe` | `project.md` (the product), `strategy.md` (how it wins) |

**Every judgment phase validates before it writes.** `:recon` and `:brainstorm` each emit a
JSON payload that must pass a schema first; the markdown is rendered from that payload, so
`criteria.md` is a rubric later phases can score against and cannot drift from the source.
Two rules the schemas enforce because they lose hackathons outright:

- Every date carries an explicit UTC offset. A floating `2026-06-29T17:00:00` is rejected.
- A disqualified idea is never scored — a number invites falling in love with an idea that
  cannot win.

## Dependencies

These are requirements of the *workflow*, not of the plugin's own code:

- [`superpowers`](https://github.com/obra/superpowers) — `:build` invokes its SDD and TDD skills
- [`@fission-ai/openspec`](https://github.com/Fission-AI/OpenSpec) — required for `:spec`.
  Install the scoped name; the bare `openspec` package on npm is an unrelated stub.
- No Playwright/MCP dependency. `:recon` uses `WebFetch`; when a page is JS-gated or
  comes back thin it records the gap in `unresolved` and asks you to paste the page,
  rather than failing silently. See the design note in `docs/design/m2-front-half.md`.

## License

MIT
