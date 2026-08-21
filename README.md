# win-hackathon

A Claude Code plugin that encodes an end-to-end hackathon workflow — from reading the
Devpost rules to submitting a deployed, documented, judge-ready project — as commands,
agents, skills, and hooks.

## Status

**Design approved. Implementation not started.**

The full design lives in [`docs/design/win-hackathon-plugin.md`](docs/design/win-hackathon-plugin.md).
[`docs/design/project-idea.md`](docs/design/project-idea.md) is the original sketch it supersedes,
kept for lineage.

Implementation is staged across five milestones; the plugin becomes genuinely usable from
M2 onward:

| Milestone | Contents | Usable after? |
|---|---|---|
| M1 — Spine | manifest, state schema, environment detection, `:init`, `:next`, `:status`, SessionStart hook | Not yet — infrastructure only |
| M2 — Front half | `:recon`, `:brainstorm`, `:describe` + ideation and scoring skills | Yes |
| M3 — Design | `:stack`, `:architect`, `:requirements`, `:spec` + design and engineering skills | Yes |
| M4 — Build & ship | `:build`, `:ship`, `:check`, `:pivot` + deploy skills | Yes |
| M5 — Close | `:review`, `:submit`, `:log` + submission skills | Complete |

## The workflow

Eleven gated phases. Nothing advances without explicit approval.

`:recon` → `:brainstorm` → `:describe` → `:stack` → `:architect` → `:requirements` →
`:spec` → `:build` → `:ship` → `:review` → `:submit`

You never need to remember that order — `:next` resolves it from on-disk state.

## Dependencies

- [`superpowers`](https://github.com/obra/superpowers) — `:build` invokes its SDD and TDD skills
- [`@fission-ai/openspec`](https://github.com/Fission-AI/OpenSpec) — required for `:spec`.
  Install the scoped name; the bare `openspec` package on npm is an unrelated stub.
- Playwright MCP (optional) — `:recon` fallback when a page is JS-gated

## License

MIT
