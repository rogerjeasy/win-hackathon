# win-hackathon — Claude Code Plugin Design

**Status:** Approved design, ready for implementation planning
**Date:** 2026-08-21
**Amended:** 2026-08-22 — §3, §4, §8, §10, §12, §15 revised after reviewing twelve winning Devpost submissions and the two reference repositories. Detail in `m2-front-half.md`.
**Amended:** 2026-08-24 — §2, §3, §4, §8, §9, §10, §13, §14 and Appendix A revised for M3 — the design and requirements phases, three diagram formats replacing a promised PNG export, and a validated payload behind every rendered surface. Detail in `m3-design.md`.
**Author:** Roger Jeasy Bavibidila
**Supersedes:** `project-idea.md`

---

## 1. What this is

`win-hackathon` is a Claude Code plugin that encodes an end-to-end hackathon workflow — from reading the Devpost rules to submitting a deployed, documented, judge-ready project — as a set of commands, agents, skills, and hooks.

It exists to solve three concrete problems:

1. **Repetition.** Every hackathon begins with substantially the same prompts. Those prompts should be versioned artifacts, not retyped prose.
2. **Portability.** Switching devices should not mean rebuilding an agentic setup by hand.
3. **Context loss.** The workflow deliberately uses `/clear` between phases to keep each phase's context clean. Today that means re-orienting the agent manually every time. The plugin makes state survive the clear.

### Design principles

| Principle | Consequence |
|---|---|
| **The workflow is phased, and phases are gated** | Nothing advances without explicit human approval. Enforced at each phase's *exit*. |
| **`/clear` is free** | All durable state lives on disk and is re-injected by a `SessionStart` hook. |
| **Never destroy user work** | Every write to a pre-existing file is previewed, backed up, and confined to marked blocks. |
| **Sponsor requirements outrank personal defaults** | Hackathon-mandated technology is non-negotiable; defaults fill only the slots the rules leave open. |
| **Judges are the users** | Every artifact is written for someone with five minutes, no account, and no context. |
| **Reuse, don't reimplement** | Build delegates to `superpowers`, code review to `/code-review`, specs to `@fission-ai/openspec`. |

### Non-goals

- Not a general-purpose project scaffolder. It is tuned for time-boxed competitive builds.
- Not a replacement for `superpowers`. It composes with it.
- Does not submit to Devpost automatically. It prepares the package; the human submits.

---

## 2. The phase model

Eleven phases, numbered 0–10. Each has one command, defined inputs, defined outputs, and an approval gate.

| # | Phase | Command | Output |
|---|---|---|---|
| 0 | **Recon** — ingest Devpost: rules, judging rubric, sponsor tech, panel, deadlines, bonus mechanics | `:recon <url>` | `.hackathon/recon.json`, `brief.md`, `rules.md`, `criteria.md` |
| 1 | **Brainstorm** — 10 ideas, gated on Stage One, then scored against the real judging criteria | `:brainstorm` | `.hackathon/ideas.json`, `ideas.md` (`--fresh` starts a clean round, prior rounds kept) |
| 2 | **Describe** — the product case and the win strategy for the chosen idea | `:describe` | `.hackathon/project.md`, `strategy.md` |
| 3 | **Stack** — sponsor tech wins, defaults fill gaps | `:stack` | `.hackathon/stack.json`, `stack.md` |
| 4 | **Architect** — architecture + data model + diagrams | `:architect` | `docs/architecture.md`, `docs/data-model.md`, `docs/assets/architecture.{mmd,svg,drawio}` |
| 5 | **Requirements** — features, acceptance criteria, Gherkin | `:requirements` | `.hackathon/requirements.json`, `requirements.md`, `features/*.feature` |
| 6 | **OpenSpec** — change proposals | `:spec` | `.hackathon/specs/NNNN-<slug>/*` (the Kiro triad — always written), `openspec/changes/*` (written when the CLI is reachable, deferred otherwise) |
| 7 | **Build** — implementation via superpowers SDD | `:build` | the application |
| 8 | **Ship** — Docker + IaC + CI/CD + deploy | `:ship` | `infra/`, `.github/workflows/`, live URL |
| 9 | **Review** — code + architecture quality | `:review` | `.hackathon/review.md` |
| 10 | **Submit** — README, runbook, challenges, video script | `:submit` | `README.md`, `docs/DEMO_RUNBOOK.md`, `.hackathon/submission.md` |

Phases 4 and 10 write directly to judge-facing locations because those artifacts are public from the moment they exist.

### Phase state machine

```
not_started ──► in_progress ──► awaiting_approval ──► approved
                    ▲                   │
                    └───── changes ─────┘

any ──► skipped        (explicit user decision, or :pivot under deadline pressure)
approved ──► in_progress   (explicit re-entry: rerunning a phase to revise it)
```

`awaiting_approval` is the only state that blocks `:next`. This is Rule 1 made mechanical.

---

## 3. Repository layout: workshop and showroom

Two zones. `.hackathon/` is where the work happens; `docs/` and the repo root are what judges see. Phase 10 promotes and polishes from the first into the second.

```
.hackathon/                  ← workshop (committed, out of the way)
  state.json                   phase status, approvals, deadline, stack decisions
  recon.json                   validated extraction payload — brief/rules/criteria render from it
  brief.md                     hackathon digest
  rules.md                     verbatim rules + eligibility
  criteria.md                  judging rubric: weights, tiebreak order, evidence slots
  ideas.json                   validated scoring payload — ideas.md renders from it
  ideas.md                     current round of 10 ideas + scores
  ideas-round-N.md             every prior round, preserved
  project.md                   selected project description (the stable product case)
  strategy.md                  how we win: criteria map, track EV, heading plan, bonus plan
  stack.json                   validated stack payload — stack.md renders from it
  stack.md                     stack decisions + rationale
  architecture.json            validated architecture payload — every architect surface renders from it
  requirements.json            validated requirements payload — requirements.md and the Gherkin render from it
  requirements.md              features + acceptance criteria
  specs/NNNN-<slug>/           rendered Kiro triad, one directory per must-have feature
  challenges.md                running issues log  ← Rule 2
  decisions.md                 ADR-lite: chosen, rejected, why
  review.md                    quality review findings
  submission.md                Devpost form field drafts
  backups/<timestamp>/         pre-write copies of anything init touched

docs/                        ← showroom (judge-facing)
  architecture.md
  data-model.md
  DEMO_RUNBOOK.md
  assets/architecture.mmd, architecture.svg, architecture.drawio

README.md                    judge landing page — live demo link first
AGENTS.md                    hard invariants for agents
CLAUDE.md                    single line: @AGENTS.md
openspec/                    OpenSpec CLI's own directory
features/                    Gherkin .feature files
infra/                       Terraform
.github/workflows/           per-service deploy pipelines
```

**Why `.hackathon/` is committed:** switching devices mid-hackathon is a stated requirement, and `state.json` is what makes `:next` resume correctly on the new machine. It also gives a teammate the full decision history on clone.

**Why the split exists:** rejected ideas, scoring rationale, and internal notes should not compete for a judge's attention with the architecture doc. Keeping them separate means `docs/` can be uniformly polished.

---

## 4. State schema

`.hackathon/state.json` is the single source of truth for orchestration.

```jsonc
{
  "schema_version": 3,
  "plugin_version": "0.1.0",

  // A digest only. The full extraction lives in .hackathon/recon.json — state.json is
  // re-injected by the SessionStart hook under a hard ~40-line cap and must stay small.
  "hackathon": {
    "name": "…",
    "url": "https://devpost.com/hackathons/…",
    "deadline": "2026-09-15T23:59:00-07:00",
    "next_action_deadline": { "label": "credit request form closes", "at": "…" },
    "tech": {
      "required": ["Amazon Bedrock"],
      "bonus":    ["Aurora pgvector"],
      "forbidden": []
    },
    "criteria_ids": ["technical-implementation", "design", "impact", "originality"],
    "tiebreak": "listed_order",
    "bonus_points_available": 0.6,
    "selected_track": null,
    "recon_ref": ".hackathon/recon.json"
  },

  "project": {
    "name": "…",
    "selected_idea": "idea-07",
    "selected_at": "2026-08-21T14:02:00Z",
    // Validated as of v3 — see §4 field notes. The rationale behind the choice lives in
    // stack.json's rendered slot table, not here; state.json stays a digest.
    "stack": {
      "repo_shape": "multi-service",      // or "next-monolith"
      "primary_database": "Aurora Postgres + pgvector",   // null when no db-like slot exists
      "ref": ".hackathon/stack.json"
    },
    "architecture_ref": ".hackathon/architecture.json",
    "requirements_ref": ".hackathon/requirements.json"
  },

  "phases": {
    "recon":      { "status": "approved",    "artifacts": [".hackathon/brief.md"], "approved_at": "…" },
    "brainstorm": { "status": "approved",    "rounds": 2, "artifacts": [".hackathon/ideas.md"] },
    "architect":  { "status": "in_progress", "started_at": "…", "resume_note": "…" },
    "build":      { "status": "not_started" }
  },

  "mode": "solo",                 // solo | team
  "team": [],

  "compliance": {
    "last_checked": "…",
    "required_tech_verified": { "Amazon Bedrock": { "used": true, "evidence": "src/lib/bedrock.ts:14" } }
  },

  "budget": {
    "total_hours": 48,
    "spent_hours": 11.5,
    "phase_budget": { "brainstorm": 2, "architect": 4, "build": 24, "ship": 4, "submit": 3 }
  },

  // Seeded at :recon (submission requirements) and :describe (bonus content), rendered by
  // :status, delivered at :submit. Tracking is what stops a cheap requirement being forgotten.
  "deliverables": {
    "submission_requirements": [{ "id": "demo-video", "status": "not_started" }],
    "bonus_content": []
  }
}
```

**Field notes**

- `stack.json`'s own slot table (per-slot choice and `source: required | bonus | default | user`) records *why* each choice was made, which feeds the README's "why this tech" section and defends the choice to judges. `state.json` only digests `repo_shape`, `primary_database`, and a `ref` back to `stack.json` — not the rationale itself.
- `resume_note` is written when a phase is interrupted. The `SessionStart` hook surfaces it verbatim so a `/clear` mid-phase is recoverable.
- `compliance.required_tech_verified[].evidence` is a `file:line` citation. A claim without a citation is treated as unverified.
- `schema_version` gates migrations. On mismatch, `:init` migrates and backs up first.
- **v1 → v2** adds `deliverables` and reshapes `hackathon` into a digest with `recon_ref`. The migration is additive and idempotent. Full M2 schemas live in `m2-front-half.md`.
- **v2 → v3** validates `project` for the first time (it was previously defaulted to `null` and never checked) and adds `project.stack.repo_shape`, `project.architecture_ref` and `project.requirements_ref`. Full M3 schemas live in `m3-design.md`.

---

## 5. `:next` — the resolver

`:next` removes the need to remember phase order. It is a resolver over on-disk reality, not a counter.

**Algorithm**

1. Read `state.json`. If absent → route to `:init`, then `:recon`.
2. **Reconcile.** For each `approved` phase, confirm its declared artifacts still exist. Any mismatch is *drift*.
3. Resolve:

| Condition | Resolution |
|---|---|
| Drift detected | **Stop.** Report exactly what disagrees. Never guess. |
| A phase is `awaiting_approval` | Do not advance. Re-present the artifact and request approval. |
| A phase is `in_progress` | **Resume** it, re-injecting `resume_note` and prior decisions. |
| All prior phases `approved` | Announce the next phase and **start it**. |
| All phases `approved` | Report done; suggest `:check` and `:status`. |

**Governing rule: run the obvious, stop on ambiguity.** `:next` does not ask permission to start an unsurprising next phase — the approval gate lives at each phase's *exit*, and gating both ends would double the interaction cost for no added safety. It *does* stop whenever the situation is ambiguous, drifted, or destructive.

**Deadline interaction.** If remaining time is below the budget for the resolved phase, `:next` says so and offers `:pivot` before starting.

---

## 6. Approval gate protocol

Rule 1, specified precisely. Every phase command terminates in the same four-step sequence:

1. **Present** the artifact — path, plus a summary short enough to evaluate without opening the file.
2. **Declare consequences** — what the next phase will treat as settled.
3. **Set** `status: awaiting_approval` and write `state.json`.
4. **Stop.** No further tool calls.

Approval is conversational — plain language, no ceremony command. On approval: `status: approved`, `approved_at` stamped. On requested changes: revise, then return to step 1. `:next` refuses to advance past `awaiting_approval`, so a forgotten gate cannot be silently skipped even after a `/clear`.

---

## 7. `:init` — environment handling

`:init` is the only command that touches files it did not create. Detection is on evidence found on disk.

| Scenario | Detected by | Behavior |
|---|---|---|
| **A. Empty folder** | no source files | Greenfield scaffold. Offers `git init`. |
| **B. Agentic setup, not ours** | `CLAUDE.md` / `AGENTS.md` / `.claude/` present, no `.hackathon/` | **Adopt.** Read existing conventions first, then present a per-file merge plan. Ask per file. Extend `CLAUDE.md` by `@import`, never replacement. |
| **C. Our project already** | `.hackathon/state.json` present | **Resume.** Print status board, reconcile drift, migrate schema if needed. Upgrade plugin-managed files only after showing a diff. |
| **D. Mid-hackathon codebase** | source present, no `.hackathon/` | **Retrofit.** Infer stack from manifests. Phase statuses are not backfilled — every phase starts at `not_started`, same as greenfield, and the user manually reviews and updates `.hackathon/state.json` to reflect what already exists before running `:next`. |
| **E. Not a git repo** | no `.git` | Offer `git init` + `.gitignore`. Never force. |
| **F. Dirty worktree** | uncommitted changes | Warn. Offer commit / stash / branch. |

Scenarios compose — a dirty non-git-repo with an existing `AGENTS.md` triggers B + E + F together.

### Non-destructive guarantees

Three mechanisms, all mandatory:

1. **Marked blocks.** Content the plugin writes into a file the user owns is wrapped:

   ```markdown
   <!-- BEGIN:win-hackathon -->
   …plugin-managed content…
   <!-- END:win-hackathon -->
   ```

   Updates rewrite only between the markers. Content outside is never read-modified-written. This matches the existing `<!-- BEGIN:nextjs-agent-rules -->` convention already in use in `kintwadi/AGENTS.md`.

2. **Backup before write.** Every pre-existing file about to be modified is first copied to `.hackathon/backups/<ISO-timestamp>/<original-path>`.

3. **`--dry-run`.** Prints the complete plan — every file, every action, every marker insertion — and writes nothing.

**Hard rule:** if a target file exists and is not fully enclosed in win-hackathon markers, `:init` must ask before writing. There is no `--force` flag. A user who wants a clean slate deletes the file themselves.

### Toolchain preflight

`:init` checks and reports, but never silently installs:

| Tool | Needed for | If missing |
|---|---|---|
| `git` | everything | Offer `git init`; hard-fail if absent from the system |
| `node` ≥ 20 | Next.js, OpenSpec | Report; block phases 6+ |
| `@fission-ai/openspec` | phase 6 | Offer to install (see §11) |
| `python3` ≥ 3.11 + `poetry` or `uv` | FastAPI backends | Report; block only if the stack needs it |
| `docker` | phase 8 containerization | Report; `:ship` degrades to non-container targets |
| `gh` | repo creation, CI setup | Report; degrade to manual instructions |
| Cloud CLIs (`aws`, `gcloud`, `vercel`, `railway`) | phase 8 | Checked lazily, only for the chosen target |

Missing tools are recorded in `state.json` and surfaced by `:status` rather than raised repeatedly.

---

## 8. Commands

Located in `commands/*.md`, invoked as `/win-hackathon:<name>`.

### Phase commands

#### `:recon <devpost-url>`

Ingests the hackathon. Full specification in `m2-front-half.md` §5.

- **Fetch strategy:** `WebFetch` on `/`, `/rules`, `/resources`, `/updates`, `/project-gallery`. If a page is JS-gated or returns thin content, fall back to the Playwright MCP. Manual paste is the last resort. `/updates` carries host rule-clarifications, which outrank the original text. Project galleries stay **empty until winners are announced**, so per-track crowding is unobservable during a live hackathon — for a recurring series, the prior edition's gallery is fetched instead.
- **Dispatches:** `hackathon-recon` agent (raw HTML must not enter the main context). It returns **only a validated `recon.json`**; `brief.md`, `rules.md` and `criteria.md` are rendered from it.
- **Extracts:** deadline + timezone, judging criteria with weights **and tiebreak order**, the **Stage-One pass/fail gate**, prize tracks and open prizes, required/bonus/forbidden technology, submission requirements, **submission form field limits**, eligibility, IP terms, the **judging panel and what it implies**, **bonus-point mechanics**, **every dated action** (credit forms, registration) not just the submission deadline, **host guidance from FAQs**, architecture-constraining constraints, and **rule ambiguities** with the clarification remedy.
- **Validates:** `recon-schema.mjs` before anything is written. Failures return to the agent verbatim, bounded at two retries. Every extracted claim carries a verbatim `quote` — the compliance rule applied to recon.
- **Writes:** `recon.json`, `brief.md`, `rules.md`, `criteria.md`; populates `state.json.hackathon` and seeds `deliverables.submission_requirements`.
- **Asks:** total hours available → seeds `budget`.
- **Recites at the gate, never buries:** `ambiguities` and `unresolved`. Recon may complete without knowing everything; it may not guess.

#### `:brainstorm [--fresh] [--angle <name>]`

Generates and ranks ten ideas.

- **Dispatches:** four `idea-generator` agents **in parallel**, each with a distinct angle:
  - `technical-wow` — the demo that makes judges lean forward
  - `social-impact` — a real, nameable beneficiary
  - `sponsor-native` — impossible without the required tech, not merely using it
  - `underserved-niche` — a specific audience nobody builds for
- Then one `idea-scorer` agent, in a **fresh context**, ranks all candidates against the rubric in `recon.json` (rendered for humans as `criteria.md`). Separating generation from scoring prevents the generator's enthusiasm from anchoring its own evaluation.
- **Evaluation order matters.** (1) The **Stage-One gate** — theme fit and genuine use of required technology; failures are listed as disqualified with reasons and are **never scored**, because a number invites falling in love with a non-compliant idea. (2) The **inversion test** — can this be stated as *X, not Y* in one sentence? (3) The **thesis test** — is there a one-line justification for the required technology that a competitor using different technology could not claim? (4) Only then, per-criterion scoring, with ties resolved by the rubric's criterion rank.
- **Each idea contains:** problem statement, intended audience, key features, thesis, inversion, track with EV note, the single **demo moment** a judge sees in under three minutes, required-tech fit, feasibility in hours, and a per-criterion score. Emitted as a validated `ideas.json`; `ideas.md` renders from it.
- `--fresh` starts a new round with **no knowledge of prior rounds** and preserves the old file as `ideas-round-N.md`. This is the documented replacement for the current `/clear`-and-regenerate loop.
- **Gate:** you select one idea, or request another round.

#### `:describe`

Writes two files — the stable product case and the volatile competitive layer. Full specification in `m2-front-half.md` §7.

- **`project.md`** — TL;DR pitch, the problem and *why now*, the insight framed as two extremes and an underserved middle, personas, features by pillar, a **day in the life with named characters**, product principles, limitations and out-of-scope. Limitations are mandatory — they become the "What's next" section of the submission. The named characters are load-bearing: in the project that won, they became the seed data, the demo script *and* the Devpost narrative, so later phases reuse the same names.
- **`strategy.md`** — the thesis in one line; a criteria map rendered from the same rubric as `criteria.md` so the two cannot drift; track choice with EV reasoning; the **heading plan** (at least one submission heading per judging criterion, thesis promoted to a top-level heading); the demo moment and a three-minute shot skeleton; the bonus-content plan; risks and mitigations.

#### `:stack`

Resolves technology, applying **sponsor-wins** precedence:

1. Required sponsor tech is fixed and cannot be traded away.
2. Personal defaults fill open slots — Next.js (latest) + TypeScript + Tailwind + shadcn/ui; FastAPI + Poetry.
3. Bonus tech is adopted when its cost is proportionate to its scoring value.
4. Every slot records a rationale.

Also selects the repository shape:

| Shape | When | Reference |
|---|---|---|
| `next-monolith` | Next.js full-stack, server actions, no separate API surface | `kintwadi` |
| `multi-service` | separate `web/`, `api/`, `agents/`, each independently deployable | `karma` |

**Emits a validated `stack.json`**; `stack.md` renders from it, so the two cannot drift.
Writes `state.json.project.stack` and **seeds `compliance.required_tech_verified`** — one
unverified entry per required-source slot, so `:check` in M4 has something concrete to flip
to `true` rather than starting from nothing. Triggers the `framework-drift-guard` skill for
any bleeding-edge pin.

#### `:architect`

- **Dispatches:** `solution-architect`, which returns only a validated `architecture.json`
  — components, entities, access control, invariants, and a `design_system` block from the
  `ui-design-principles` skill. **Every other surface renders from that one payload.**
- **Writes:** `docs/architecture.md` (components, boundaries, data flow, trust boundaries, failure modes), `docs/data-model.md` (entities, relationships, multi-tenancy and row-level security strategy, migrations), and three diagram formats — Mermaid, SVG and drawio — laid out from the same graph once, so they cannot disagree with each other. **There is no automated `.png` export.** Nothing in the winner corpus this plugin draws its evidence from automated one either — every rendered PNG in that evidence base was exported by hand — so promising one here would be a capability the plugin does not have.
- **Writes `AGENTS.md`** via the `security-invariants` skill: numbered, non-negotiable invariants ending in an explicit instruction to stop and flag rather than ship a violation. `CLAUDE.md` becomes a single `@AGENTS.md` line.
- Diagrams are treated as a deliverable, not a nicety — they are a visible part of design scoring.

#### `:requirements`

**Emits a validated `requirements.json`** — FR-IDs with acceptance criteria and a test
matrix, rendered as `.hackathon/requirements.md`, **alongside** `features/*.feature` in
Gherkin rendered from the same payload. Every must-have feature gets at least one scenario.
Gherkin scenarios become the acceptance tests phase 7 must satisfy, so they are written to be
executable, not decorative. A judging criterion no feature claims fails validation before
either surface is written — a criterion nothing is built for is a guaranteed zero on a
weighted axis, and the pipeline refuses to carry that forward silently.

#### `:spec`

Reads no payload of its own — everything it writes is derived from `architecture.json` and
`requirements.json`. Writes the **Kiro triad** — `requirements.md`, `design.md`, `tasks.md`
— in `.hackathon/specs/NNNN-<slug>/` for every must-have feature; `design.md` is the slice
of the architecture M4's build agent reads for that feature, not the full
`docs/architecture.md`. **Alongside** the triad it drives `@fission-ai/openspec`: verifies
the CLI, runs `openspec init` if the directory is absent, and creates one change proposal
per must-have feature in `openspec/changes/<slug>/`, seeded from the same two payloads. **An
unreachable CLI defers that half rather than failing the phase** — the triad has no external
dependency, so a missing `openspec` install leaves three of the four surfaces complete and
the phase still finishable; only the fourth is deferred until the CLI is reachable.

#### `:build [--feature <id>]`

- **Invokes `superpowers:subagent-driven-development`.** No bespoke implementation agent — that work is already solved.
- Feeds it: the OpenSpec proposal, Gherkin scenarios, `AGENTS.md` invariants, and `stack.md`.
- Enforces TDD via `superpowers:test-driven-development`.
- Builds in dependency order; each feature ends green.
- **Judge Quick-Start is a build-time requirement, not a submission afterthought:** a seeded, no-account demo path must exist in the application itself (idempotent seed endpoint + a visible "explore the demo" entry point). Retrofitting this at submission time is how demos get lost.
- Runs `:check` automatically after each feature to catch sponsor-tech drift early.

#### `:ship`

- **Dispatches:** `deploy-engineer`.
- **Produces:** per-service `Dockerfile`, `infra/` Terraform, path-filtered per-service GitHub Actions workflows, keyless cloud auth (WIF / OIDC — no long-lived secrets in the repo), and `.env.example`.
- **Targets** are chosen from `stack.json`, not hardcoded: Vercel (frontend), Cloud Run, Railway, Render, AWS, or Docker Compose as the local-only fallback.
- **Gate requires a reachable URL.** A deploy that has not been fetched successfully is not shipped.
- Writes the live URL into `state.json`; the README and runbook consume it from there.

#### `:review`

- **Dispatches:** `quality-reviewer` for architecture-level findings — boundary violations, invariants asserted in `AGENTS.md` but not enforced in code, unmanaged failure modes, security posture.
- **Delegates code-level review to the existing `/code-review` skill** rather than reimplementing it.
- Writes `review.md` classified as **blocking / should-fix / post-hackathon**, ordered by judge visibility. Under deadline pressure, only blocking items are mandatory.

#### `:submit`

- **Dispatches:** `submission-writer`.
- **Produces:**
  - `README.md` as a judge landing page — **live demo link first**, then what it is, why this technology, features, security model, tech stack, running locally, deploying, tests, demo-data note. This is the structure that won.
  - `docs/DEMO_RUNBOOK.md` — prerequisites, **Judge Quick-Start (no account required)**, full manual walkthrough, reset procedure, expected duration.
  - `.hackathon/submission.md` — drafted Devpost fields: inspiration, what it does, how we built it, **challenges we ran into** (assembled from `challenges.md` — the payoff for Rule 2), accomplishments, what we learned, what's next.
  - Demo video script with shot list and timings.
  - Screenshot shot-list mapped to judging criteria.
- Runs a final `:check` and refuses to declare completion while any required submission element is missing.

### Utility commands

| Command | Behavior |
|---|---|
| `:next` | The resolver (§5) |
| `:status` | Read-only board: phase states, approvals, hours remaining vs. budget, compliance summary, missing tools. Writes nothing |
| `:check` | Compliance audit: required tech actually used (with `file:line` evidence), forbidden tech absent, submission requirements satisfied, rules honored. Dispatches `compliance-checker`. Safe to run at any time |
| `:pivot` | Deadline triage. Recomputes remaining time, proposes a demoable core, marks cut features `skipped` with rationale in `decisions.md`. Requires approval — it is a scope decision, not an automatic one |
| `:log <text>` | Appends a timestamped entry to `challenges.md`. Agents write this file automatically; this is the manual path |

---

## 9. Agents

`agents/*.md`. Each exists because its work would otherwise pollute the main context.

| Agent | Model | Tools | Justification |
|---|---|---|---|
| `hackathon-recon` | Opus | WebFetch, Playwright MCP, Read, Write | Raw Devpost HTML is very large; returns only a structured brief |
| `idea-generator` | Opus | Read, Write | Spawned ×4 in parallel with different angles. One agent producing ten ideas converges; four agents diverge |
| `idea-scorer` | Opus | Read, Write | Scores in a fresh context, unanchored by the generator's framing |
| `solution-architect` | Opus | Read, Write, Bash, WebFetch | Deep design exploration; **returns `architecture.json` only** — every document, diagram, and `AGENTS.md` renders from that one payload by code, not by the agent |
| `deploy-engineer` | Opus | Read, Write, Edit, Bash | Dockerfiles, Terraform, CI — one large focused chunk |
| `quality-reviewer` | Opus | Read, Grep, Glob, Bash | Reads broadly; must not carry implementation bias |
| `compliance-checker` | Sonnet | Read, Grep, Glob, Bash | Mechanical, evidence-gathering, high-volume search |
| `submission-writer` | Opus | Read, Grep, Glob, Bash, Write | Must explore the built app to write an accurate runbook |

**Deliberately absent:** an implementation agent. `:build` calls `superpowers:subagent-driven-development`.

---

## 10. Skills

`skills/<name>/SKILL.md`. This is the plugin's real payload — accumulated know-how, made portable. **Bold ships in v1.**

### Process

| Skill | Content |
|---|---|
| **`winning-ideation`** | Angles that win; anti-patterns (todo apps, thin chatbot wrappers, "X but with AI"); the novelty test; the demoability test; the quantification habit; scoping to the available hours. Ships `references/winner-corpus.md` — twelve winning submissions distilled to pitch, thesis, inversion, heading structure and prize, so the plugin carries its own evidence instead of relying on model recall |
| **`judging-criteria-scoring`** | Parsing criteria into weighted rubrics; **Stage One as a separate pass/fail gate run before scoring**; **tiebreak by listed order**, so the first criterion outweighs its nominal weight; **bonus points as score headroom** (a 5.6 ceiling, not 5); expected value across prize tracks, computed from prize structure and prior editions — and stating the uncertainty honestly, because galleries are empty until winners are announced |
| **`sponsor-tech-thesis`** | The one-line "why *this* technology, that a competitor using something else could not claim." The inversion form; the placement rule — a top-level heading high in the document, which is what separated the track winners from the category prize; and the failure mode of a thesis the architecture does not actually support. Loaded at four phases: `:brainstorm` scores against it, `:describe` promotes it, `:architect` must earn it, `:submit` leads with it |
| `devpost-recon` | Devpost page anatomy; where rules, criteria, and sponsor requirements actually live — **including partner resource pages, which carry their own required-signal lists**, and FAQs, which carry host scoring language; separating hard deadlines from dated actions; spotting rule ambiguities and the clarification remedy; what to extract verbatim vs. summarize. (Named to avoid collision with the `hackathon-recon` *agent* that consumes it) |
| `project-description` | The shape of a project description that survives contact with implementation; named characters as load-bearing; the heading-per-criterion rule |

### Design

| Skill | Content |
|---|---|
| **`ui-design-principles`** | The principles behind the best-design win: visual hierarchy, restraint, motion, empty states, responsive behavior, accessibility as table stakes. **Loads at `:architect`**, where `solution-architect` uses it to produce the `design_system` block in `architecture.json` |
| **`monorepo-structure`** | Both shapes — `next-monolith` and `multi-service` — with the criteria for choosing |
| **`frontend-architecture`** | Next.js App Router: route groups, server vs. client components, protected-by-default route groups, data-access layering |
| **`backend-architecture`** | FastAPI layering, dependency injection, DAL boundaries, error contracts, config management |
| `data-modeling` | Entity design, multi-tenancy, row-level security, migrations under time pressure |
| `architecture-diagramming` | Mermaid, SVG and drawio generation from one laid-out graph — **no automated PNG export**, layered views, what judges actually read |

### Engineering

| Skill | Content |
|---|---|
| **`security-invariants`** | Generates the fail-closed, defense-in-depth `AGENTS.md` contract: protected-by-default routing, DAL-enforced tenancy, dual audit + operational logging, secret hygiene, and the closing "stop and flag rather than ship" instruction |
| **`framework-drift-guard`** | Generates the "This is NOT the *framework* you know" banner for any bleeding-edge pin, directing agents to read vendored docs before writing code. Prevents training-data drift on fast-moving frameworks |
| `gherkin-requirements` | Writing executable scenarios; the acceptance-criteria-to-test pipeline. **Unevidenced** — no project in the winner corpus used Gherkin; this is craft, not a proven pattern |
| `openspec-workflow` | Driving `@fission-ai/openspec`: proposal structure, validation, the unreachable-CLI path. **Unevidenced** — no project in the winner corpus used OpenSpec; this is craft, not a proven pattern |

### Ship

| Skill | Content |
|---|---|
| **`deploy-targets`** | Playbooks: Vercel, Cloud Run, Railway, Render, AWS, Docker Compose. Selection criteria and time-to-first-URL for each |
| **`containerization`** | Per-service Dockerfiles, multi-stage builds, image size under time pressure |
| `cicd-github-actions` | Path-filtered per-service deploy workflows; keyless auth via WIF/OIDC; test-then-deploy job structure |
| `iac-terraform` | Module layout (network, database, iam, storage, messaging, budget); state management for short-lived projects |

### Submission

| Skill | Content |
|---|---|
| **`judge-ready-readme`** | The README-as-landing-page structure: live demo first, why-this-tech, security model, demo-data note |
| **`demo-runbook`** | Reproducible walkthroughs; the **Judge Quick-Start (no account required)** pattern; idempotent seed and reset |
| `devpost-submission` | Mapping artifacts to Devpost form fields; what the challenges log is for |
| `demo-video-script` | Structure for a sub-three-minute video: hook, problem, demo, technical depth, close |

---

## 11. Hooks

`hooks/hooks.json`. Four hooks, each justified.

### SessionStart — the one that makes `/clear` free

```jsonc
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/inject-state.sh\"",
        "shell": "bash",
        "async": false
      }]
    }]
  }
}
```

Reads `state.json` and injects a compact block: current phase and status, what is approved, hours to deadline, required sponsor tech, active invariants, and any `resume_note`. Exits silently and immediately when `.hackathon/` is absent, so the hook costs nothing in unrelated projects.

**Context budget: hard cap of ~40 lines.** A state injection that grows without bound defeats its own purpose.

### UserPromptSubmit — deadline pressure

Silent until remaining time drops below 25% of the budget, then injects a brief time-remaining note and, if a phase is over budget, suggests `:pivot`. Rare by design; a warning on every prompt is a warning nobody reads.

### PostToolUse — progress stamping

Matcher `Bash`, condition `Bash(git commit:*)`. Updates `state.json` with a real timestamp and commit reference. This gives the deadline guard actual data rather than estimates.

### Stop — the challenges log

If the session performed substantial work and `challenges.md` was not modified, emit a reminder to log what was hit. This is Rule 2 enforced mechanically rather than remembered. The reminder names the specific failures observed in the session so the entry can be written from fact.

---

## 12. Cross-cutting systems

### Challenges log (Rule 2)

`challenges.md` is append-only, one entry per issue:

```markdown
## 2026-08-21T14:32Z — Bedrock streaming responses truncated at 4KB

**Phase:** build
**Context:** Streaming Claude responses through the Next.js route handler.
**Symptom:** Responses cut off mid-sentence at ~4KB.
**Root cause:** Default Next.js response buffering; needed explicit stream passthrough.
**Resolution:** Switched to a ReadableStream with an explicit flush.
**Time lost:** ~40 min
```

Written by agents when they hit an issue (Rule 2), by `:log` manually, and nudged by the Stop hook. Phase 10 assembles it into the Devpost "Challenges we ran into" field — which is why root cause and time lost are captured while they are still fresh.

### Decisions log

`decisions.md` records what was chosen, what was rejected, and why. Populated by `:stack`, `:architect`, and `:pivot`. Feeds the README's "why this technology" section and answers judges' architecture questions.

### Deadline and scope guard

Budget is seeded at `:recon`, spent time is stamped by the PostToolUse hook, and `:status` reports both. When remaining time falls below the resolved phase's budget, `:next` says so before starting and offers `:pivot`. `:pivot` proposes a demoable core, requires approval, and records every cut in `decisions.md` so the submission's "What's next" section writes itself.

### Compliance tracking

`:check` verifies required technology is genuinely used — a dependency in `package.json` is not evidence; a `file:line` call site is. Runs automatically after each `:build` feature and again at `:submit`. Missing required sponsor technology is a common disqualifier and the cheapest possible loss.

### Bonus contributions

Many hackathons attach extra points to published content about how the project was built — H0 offered +0.2 per public piece to a maximum of +0.6, raising the ceiling from 5.0 to **5.6**. That is roughly eleven percent of the maximum score for a few hours of writing, and most entrants skip it.

It is handled in three steps across three milestones, so nothing is built early and nothing is forgotten: `:recon` extracts the mechanics (points, eligible platforms, the required "created for this hackathon" disclosure, the hashtag, and the separate deadline) into `recon.json`; `:describe` writes the plan into `strategy.md` and seeds `state.json.deliverables.bonus_content`; `:submit` delivers and records the published URLs. `:status` surfaces the outstanding items throughout.

### Team mode

Default `solo`: direct commits, no PR ceremony, worktrees only to parallelize your own agents. Setting `mode: team` enables branch-per-feature, PR review gates, and owner fields on tasks in `state.json`. The mode is a state field, not a separate installation.

---

## 13. Plugin layout and distribution

```
win-hackathon/
  .claude-plugin/
    plugin.json
  commands/            17 command definitions
  agents/              8 agent definitions
  skills/<name>/SKILL.md   23 skills
  hooks/
    hooks.json
    inject-state.sh
    deadline-check.sh
    stamp-progress.sh
    challenges-nudge.sh
  scripts/
    state.mjs          read/write/validate/migrate state.json
    detect-env.mjs      the §7 detection matrix
    preflight.mjs       toolchain checks
  templates/
    AGENTS.md.tmpl  README.md.tmpl  DEMO_RUNBOOK.md.tmpl
    Dockerfile.*.tmpl  workflow.*.tmpl
  tests/
  README.md
```

`plugin.json`:

```json
{
  "name": "win-hackathon",
  "version": "0.1.0",
  "description": "End-to-end hackathon workflow: recon, ideation scored against real judging criteria, architecture, spec-driven build, deploy, and a judge-ready submission package.",
  "author": { "name": "Roger Jeasy Bavibidila" },
  "homepage": "https://github.com/rogerjeasy/win-hackathon",
  "license": "MIT",
  "keywords": ["hackathon", "devpost", "scaffolding", "spec-driven", "deployment"]
}
```

**Distribution:** own git repository with a `.claude-plugin/marketplace.json`, installed via `/plugin marketplace add rogerjeasy/win-hackathon`. Local development uses a filesystem marketplace pointing at the working copy.

**M3's contribution to the counts above:** four commands (`:stack`, `:architect`,
`:requirements`, `:spec`), one agent (`solution-architect`), and ten skills — eight loaded
across `:stack` and `:architect`, plus `gherkin-requirements` and `openspec-workflow` at
`:requirements` and `:spec`. It also adds a `scripts/lib/` directory of pure, dependency-free
modules (schema validators, renderers, and the three diagram emitters) that this layout
sketch predates and does not yet itemize.

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `superpowers` | required | `:build` invokes SDD and TDD skills |
| `@fission-ai/openspec` | required for phase 6 | **Install `@fission-ai/openspec`, never `openspec`** — the bare name on npm is an unrelated squatted `0.0.0` stub. Wrong install produces confusing failures at phase 6 |
| Playwright MCP | optional | `:recon` fallback when WebFetch returns thin content |
| GitHub MCP or `gh` | optional | Repo creation and CI configuration |

---

## 14. Implementation staging

Too large for a single pass. Five milestones; the plugin is genuinely useful from M2 onward.

| Milestone | Contents | Usable after? |
|---|---|---|
| **M1 — Spine** | `plugin.json`, state schema + `state.mjs`, `detect-env.mjs`, `:init` (all six scenarios), `:next`, `:status`, SessionStart hook | Not yet — infrastructure only |
| **M2 — Front half** | `:recon`, `:brainstorm` (+ 4 generators, scorer), `:describe`, state schema v2, and five skills. Specified in `m2-front-half.md` | **Yes** — replaces the manual ideation loop end to end |
| **M3 — Design** | `:stack`, `:architect`, `:requirements`, `:spec`, design + engineering skills, `security-invariants`, `framework-drift-guard` | **Yes** — covers everything up to writing code |
| **M4 — Build & ship** | `:build`, `:ship`, `:check`, `:pivot`, deploy skills, `deploy-engineer`, `compliance-checker`, remaining hooks | **Yes** — full pipeline to a live URL |
| **M5 — Close** | `:review`, `:submit`, `:log`, submission skills, `quality-reviewer`, `submission-writer` | Complete |

**Validation:** each milestone is exercised against a real archived Devpost hackathon, and M4–M5 are validated by reproducing a `kintwadi`- or `karma`-shaped project from a clean directory.

**M3 delivers in two stages, specified in `m3-design.md`.** Stage 1 ships `:stack` and
`:architect`; Stage 2 ships `:requirements` and `:spec`. The split is a review boundary, not
a scope cut — M3 is not done until both stages have landed, which is what this amendment
records.

---

## 15. Open questions

Deferred deliberately; none blocks M1–M3.

1. **Idea-scoring calibration.** *Partially answered.* `winning-ideation` now ships a corpus of twelve winning submissions with known placements — six of them from a single hackathon we also entered — which is the calibration set this question asked for. What the corpus still cannot say is how far apart the runners-up scored, so scores remain a ranking aid, not a selection oracle.
2. **Devpost markup stability.** `:recon` parsing will break when Devpost changes its pages. The fallback chain limits the damage, but the extraction prompts will need periodic revision.
3. **Multi-hackathon concurrency.** One `.hackathon/` per repository is assumed. Running two hackathons from one repo is out of scope.
4. **Budget accuracy.** Wall-clock time from commit stamps is a proxy for effort, not a measure of it. Adequate for triage; not for planning.

---

## Appendix A — Rules traceability

| Original rule | Where it lives |
|---|---|
| Approval before advancing to the next phase | §6 approval gate protocol; `awaiting_approval` blocks `:next` (§5) |
| Agents log issues to a shared markdown file | §12 challenges log; Stop hook (§11); `:log` (§8); consumed by `:submit` |
| `:init` must ask before overwriting anything | §7 non-destructive guarantees; marked blocks, backups, `--dry-run`, no `--force` |
| Devpost URL as brainstorming input | §8 `:recon` |
| Same setup across devices | `.hackathon/` committed; state schema §4; marketplace install §13 |
| Plugin loads the right skill per phase | §8 per-command skill invocation; §10 skill library |
| Sponsor requirements outrank personal defaults | §8 `:stack` sponsor-wins precedence — required tech is fixed, defaults fill only the open slots |
| Reuse, don't reimplement — specs to `@fission-ai/openspec` | §8 `:spec` drives the real CLI directly; the Kiro triad it also writes has no external dependency and is not a reimplementation of OpenSpec |

---

**Amended 2026-08-24 by `m3-design.md`** — §2, §3, §4, §8, §9, §10, §13, §14 and
Appendix A. The substantive changes: the diagram pipeline emits Mermaid, SVG and drawio from
one graph and no longer promises an automated PNG (§2's phase table, §3's repository layout,
and §8's `:architect` prose all said so before this amendment); `:requirements` and `:spec`
produce four surfaces from one payload rather than Gherkin and OpenSpec alone, and §2's
phase-3/5/6 rows and §3's `.hackathon/` tree now name the validated JSON payloads and the
Kiro triad those phases actually write; Appendix A gains two traceability rows for the
sponsor-wins and reuse-not-reimplement principles M3 is the first milestone to implement.
