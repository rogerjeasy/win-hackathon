# win-hackathon M4 — Design

**Status:** approved 2026-08-30
**Covers:** phases 7–8 — `:build`, `:ship` — plus the two audit/triage utilities that sit
alongside them, `:check` and `:pivot`
**Amends:** §4, §8, §9, §10, §11, §13, §14 of `win-hackathon-plugin.md`
**Predecessor:** `m3-design.md` (phases 3–6, shipped 2026-08-30)

---

## 1. Scope

M4 covers the two phases between a finished spec and a live URL, plus the two utility
commands that keep the build honest under time pressure. After M4 the plugin takes a
hackathon from an approved `.hackathon/specs/` triad to a deployed, sponsor-tech-verified
application — the full pipeline the parent design promises at this milestone (§14: "full
pipeline to a live URL").

| Phase / utility | Command | Payload | Rendered / written surfaces |
|---|---|---|---|
| 7 | `:build [--feature <id>]` | *(none — reads `requirements.json` + `architecture.json` + the Kiro triad)* | the application; ticks `.hackathon/specs/NNNN-<slug>/tasks.md` checkboxes as it goes |
| — | `:check` | *(none — overwrites in place)* | `state.json.compliance` |
| 8 | `:ship` | `deploy.json` | `state.json.project.deploy` (digest), `Dockerfile`s, `infra/`, `.github/workflows/`, `.env.example` |
| — | `:pivot` | *(none — appends to existing state)* | `state.json.project.cut_features`, `decisions.md` |

One new validated payload, `deploy.json`, following the `stack.json` /
`architecture.json` pattern M2/M3 established — but not four. `:check` and `:pivot` are
**not** judgment phases in the sense recon/stack/architect/requirements are: they are
repeatable audits and a triage action over state that already exists, so they read and
mutate `state.json` directly rather than growing a payload of their own. This was decided
explicitly rather than defaulted into, because every prior milestone's answer had been "yes,
add a contract" — see §2.

### File layout

```
.hackathon/
  deploy.json               target strategy, per-service targets, urls, verification evidence
  decisions.md              (existing file, M4 adds :pivot's entries)
  specs/NNNN-<slug>/
    tasks.md                (existing file — :build reads and ticks its checkboxes; no new
                              progress state duplicated into state.json)

Dockerfile                  one per service (repo root for next-monolith, web/ api/ agents/
                             for multi-service)
infra/                      Terraform: network, database, iam, storage modules
.github/workflows/          path-filtered per-service deploy pipelines
.env.example                (existing convention, generated here)
```

No new judge-facing surface. `deploy.json` lives in the workshop because its content —
per-service verification evidence, target rationale — is exactly the kind of internal note
§3 of the parent design keeps out of a judge's path; the one fact judges need (the live URL)
surfaces through the README at `:submit` (M5), sourced from `state.json.project.deploy`.

### Dependency chain

```
requirements.json ─┬─► specs/NNNN-<slug>/ (tasks.md ticked by :build) ─► the application
architecture.json ─┘
stack.json ────────────────────────────────────────────────────────────► deploy.json (:ship)
requirements.json ─────────────────────────────────────────────────────► cut_features (:pivot)
```

`:build` writes no payload of its own — it is the one phase whose "artifact" is the
application itself, tracked through a file (`tasks.md`) that already exists rather than a
new one. `:ship` is the only M4 command that adds a JSON contract, and it depends only on
`stack.json` — rerunning `:stack` marks `deploy.json` for review through the existing drift
check, same as every other downstream dependency in this plugin.

---

## 2. Why `:check` and `:pivot` break the contract-then-render pattern

Every judgment phase since M2 (`:recon`, `:brainstorm`, `:stack`, `:architect`,
`:requirements`) emits a validated JSON payload and renders markdown from it, specifically
so two surfaces can never disagree. `:check` and `:pivot` are a different shape of command:

- **`:check` is re-run, not re-entered.** It has no "round" concept — every invocation
  produces a fresh verdict that should *replace* the last one, not accumulate alongside it.
  A `compliance.json` would just be `state.json.compliance` copied to a second location with
  an extra render step in between. It overwrites `state.json.compliance` in place —
  `required_tech_verified` (already seeded unverified by `:stack`), a new
  `forbidden_tech_found: []`, and `last_checked` — and reports pass/fail inline. Nothing is
  written for `:status` to later discover that `state.json` doesn't already say.
- **`:pivot` mutates existing state, it doesn't judge something new.** The judgment already
  happened at `:requirements` — `:pivot` is triage over that judgment's *consequences* under
  a deadline, not a new evaluation of the features themselves. Its output is an *instruction*
  ("skip FR-03"), not a document. `requirements.json` stays the write-once record of what was
  scoped; `:pivot` appends FR-IDs to `project.cut_features` and writes the rationale to
  `decisions.md`. `requirements.md`, the Gherkin, and the Kiro triad are never regenerated —
  `:build` and `:next` cross-reference `cut_features` directly instead.

`:ship` keeps the pattern because it *is* a one-time judgment (which target, which
strategy) with real structured output (per-service URLs and verification evidence) that
`:submit` (M5) needs to cite precisely — the same reason `stack.json` exists.

---

## 3. The `deploy.json` contract

```jsonc
{
  "target_strategy": "vercel" | "cloud-run" | "railway" | "render" | "aws" | "docker-compose",
  "services": [
    {
      "name": "web",
      "kind": "frontend" | "backend" | "agent" | "worker",
      "target": "vercel",
      "dockerfile": "web/Dockerfile",        // null when the target has no image (e.g. Vercel)
      "url": "https://…",
      "verified": true,
      "verified_at": "2026-09-01T02:14:00Z",
      "verification_method": "curl -sf <url> (exit 0)"
    }
  ],
  "infra": {
    "terraform_modules": ["network", "database", "iam"],
    "state_backend": "local" | "remote"
  },
  "cicd": {
    "workflows": [".github/workflows/deploy-web.yml"],
    "auth": "wif" | "oidc" | "static-secret"
  }
}
```

**Validation rules (`deploy-schema.mjs`):**

- Every entry in `stack.json`'s slot table that is a deployable service must have a matching
  `services[]` entry — a validated stack with an undeployed frontend fails validation before
  the file is written, the same "nothing is silently dropped" rule `requirements-schema.mjs`
  already enforces for judging criteria.
- `verified: true` requires a non-null `verified_at` and `verification_method` — the schema
  itself makes "shipped on faith" structurally impossible, not just discouraged in prose.
- `auth: "static-secret"` is valid (a degraded path exists) but `:ship`'s command file must
  say plainly that this is a fallback, not the default — the parent design's "keyless cloud
  auth… no long-lived secrets in the repo" principle stays the target, not a requirement the
  schema silently drops.

`state.json.project.deploy = { "primary_url": "…" | null, "ref": ".hackathon/deploy.json" }`
mirrors `project.stack`'s digest-plus-ref shape exactly: the one fact hooks and `:status`
need without opening a second file, full rationale one hop away.

---

## 4. State schema v4

Additive only, same migration shape as v1→v2 and v2→v3:

```jsonc
{
  "schema_version": 4,

  "hackathon": {
    // new — stamped once, at :recon, the same point that already asks "total hours available"
    "started_at": "2026-08-30T09:00:00Z"
  },

  "project": {
    // new — FR-IDs :pivot has cut. Never removes or edits requirements.json itself.
    "cut_features": ["FR-05"],
    // new — digest + ref, mirrors project.stack
    "deploy": { "primary_url": "https://…", "ref": ".hackathon/deploy.json" }
  },

  "budget": {
    // existing field, now actually written — PostToolUse stamps this on every git commit
    "spent_hours": 11.5,
    // new — {at, sha} of the commit that produced the last spent_hours stamp
    "last_commit": { "at": "2026-08-30T20:14:00Z", "sha": "a1b2c3d" }
  }
}
```

**`compliance` and `budget` are validated for the first time in v4**, the same treatment
v3 gave `project` (schema.mjs's own comment already flags this: *"M4's compliance-checker
reads project.stack, and an unvalidated field a later phase depends on is how a silent
status bug ships"*). `required_tech_verified` must be an object mapping non-empty string
keys to booleans; the new `forbidden_tech_found` must be an array of strings;
`budget.total_hours`/`spent_hours` must be non-negative numbers or `null`; `phase_budget`
values must be non-negative numbers; `last_commit`, when present, needs a non-empty `sha`
and an offset-qualified `at`.

`phases.build` and `phases.ship` keep the plain `{status}` shape every other phase already
has — no per-feature sub-object. `:build`'s resume logic reads `tasks.md` checkboxes across
`.hackathon/specs/*/`, not a duplicate progress structure in `state.json`; two sources of
truth for the same fact is exactly the drift class the M3 final review spent a whole fix
wave closing (Kiro spec-folder identity drifting from array position — see the M3 project
memory). `phases.build` reaches `awaiting_approval` only once every must-have, non-cut
FR-ID's `tasks.md` is fully `[x]` and the last `:check` passed clean.

**v3 → v4 migration:** additive and idempotent, same test shape as v2→v3 — `hackathon.started_at`
defaults to `null` on migrate (backfilling a real value is a human call, same treatment
`:init`'s Scenario D gives phase statuses on a retrofit); `project.cut_features` defaults to
`[]`; `project.deploy` defaults to `{ primary_url: null, ref: null }`; `budget.last_commit`
defaults to `null`.

---

## 5. The commands

### `:build [--feature <id>]`

- **Feature list** = `requirements.json.features` filtered to `priority === 'must'`, in
  array order — the same order that already numbered their `specs/NNNN-<slug>/` folders at
  `:spec` time. No new dependency field: the order already carries that intent, and adding a
  second ordering mechanism would just create a place for the two to disagree.
- **Skips** any FR-ID present in `project.cut_features`.
- **Done means every checkbox in that feature's `tasks.md` is `[x]`.** `:build` reads the
  file to resume — it does not track progress a second way.
- **Context bundle handed to `superpowers:subagent-driven-development`:** the feature's Kiro
  `design.md` (the architecture slice) and `requirements.md` (acceptance criteria) from
  `.hackathon/specs/NNNN-<slug>/`, its `features/<slug>.feature` Gherkin, `AGENTS.md`
  (invariants), and `stack.md` (tech decisions + rationale). **`tasks.md` is not context —
  it *is* the plan `subagent-driven-development` executes**, checkbox by checkbox, each one
  ending in `test → confirm-fails → implement → suite → commit`, exactly as `emit-kiro.mjs`
  already renders it.
- **`openspec/changes/<slug>/` is deliberately not read.** M3's open question #3 asked
  whether all four spec surfaces would find a reader in M4. The honest answer, recorded here
  rather than left open again: three do (Kiro triad, Gherkin) and OpenSpec's proposal does
  not — it remains a standalone artifact for a human who wants to drive the CLI directly.
  Nothing about `:spec` changes as a result; this only closes the question `:spec` left open.
- Enforces TDD via `superpowers:test-driven-development` (already implicit in how
  `tasks.md` is structured; `:build`'s job is to hand off the right slice, not re-implement
  the discipline).
- **Judge Quick-Start is validated as part of the last feature's gate** — the seeded,
  no-account demo path is a build-time requirement per the parent design, not a `:submit`
  afterthought, so `:build` checks it exists and responds before setting `awaiting_approval`.
- **Runs `:check` automatically after each feature.** A feature that breaks required-tech
  usage is caught the same day it was written, not at `:submit`.
- `--feature <id>` builds one feature out of default order — for resuming a stalled one, or
  deliberately reprioritizing under `:pivot`'s guidance.

### `:check`

- Dispatches `compliance-checker`.
- **Overwrites** (never appends) `state.json.compliance`: `required_tech_verified` stays
  the flat `{ [requirement_ref]: boolean }` map `:stack`'s `buildComplianceSeed` already
  seeds (verified via `docs/design/m3-design.md`'s shipped `stack-apply.mjs`, not the
  parent design's illustrative `{used, evidence}` shape from before M3 concretized it —
  this design corrects that drift rather than reshaping an already-shipped field). A
  dependency in a manifest is never accepted as evidence for flipping an entry to `true` on
  its own — a real call site is required — but the `file:line` citation itself is reported
  **inline**, not persisted: `state.json` stays a digest, same principle already applied to
  `project.stack`/`architecture_ref`. Also sets a new `forbidden_tech_found: []` and
  `last_checked`.
- **Deliverables auditing is deferred to M5, not built here.** This section originally
  called for `:check` to also verify `deliverables.submission_requirements` / `bonus_content`
  against the repo. The Stage 1 checkpoint review found that landed half-wired — the
  `compliance-checker` agent was told to read those fields with no report field to put
  findings in, and none of `validateComplianceReport`/`applyCompliance`/`check.mjs` ever
  touch `state.deliverables`. Rather than bolt on a report shape under review pressure,
  the decision is to defer it cleanly: M5's `:submit` already runs a final `:check` and is
  the natural place to design the deliverables-report shape properly, with the full
  submission-fields context `:submit` has and `:check` alone does not. `:check` in M4
  covers required/forbidden technology only.
- Prints a pass/fail report inline. Writes nothing but `state.json` — no `compliance.md`.
- Safe to run at any time; called automatically by `:build` (after each feature) and will be
  called again by `:submit` in M5.

### `:ship`

- Dispatches `deploy-engineer`.
- **Target selection:** sponsor-mandated cloud (if `stack.json` names one) wins outright;
  otherwise `next-monolith` → Vercel, `multi-service` → Cloud Run / Railway / Render per
  service, per the `deploy-targets` skill's selection table.
- **Produces:** per-service `Dockerfile`, `infra/` Terraform, path-filtered
  `.github/workflows/`, keyless auth (WIF/OIDC — falls back to a clearly-flagged
  static-secret path only when the target has no OIDC support), `.env.example`.
- **Actually deploys** — calls the vendor CLI via `Bash` (`vercel deploy`, `gcloud run
  deploy`, …), then `curl`s every resulting URL. Anything that doesn't return 2xx keeps
  `phases.ship` at `in_progress` with a `resume_note` naming the exact blocker (CLI missing,
  not authenticated, image failed to build) — nothing is marked shipped on faith.
- **Degrades per the existing toolchain-preflight table** (§7 of the parent design): no
  Docker → non-container target; missing cloud CLI → reports and gives manual steps rather
  than blocking silently.
- On full success: writes `deploy.json`, sets `state.json.project.deploy`, phase →
  `awaiting_approval`. **Gate requires a reachable URL** — this is where that parent-design
  requirement is actually implemented, not just stated.

### `:pivot`

- Recomputes `remaining_hours = (hackathon.deadline − now) / 3600000` and compares it against
  the sum of `budget.phase_budget` entries for phases not yet `approved`.
- **Cut candidates** = must-have features not yet all-`[x]` in their `tasks.md`.
- **Ranks by judging-criterion exposure**, reusing `requirements.json`'s existing
  `criterion_refs` — no new field. A feature that is the *sole* claim on some judging
  criterion (the same condition `requirements-schema.mjs` already treats as an "orphan
  criterion scores zero" validation warning at write time) is flagged and **never
  auto-proposed** — cutting it would guarantee a zero on a whole weighted axis. Features
  whose criteria are also covered by an already-`[x]` feature are proposed first.
- **Presents** the proposed cut list with the remaining-time math and **requires approval**
  — the one M4 command that gates, because it is a scope decision, not an automatic one, per
  the parent design.
- **On approval:** appends each cut FR-ID to `project.cut_features`; writes the rationale to
  `decisions.md`. `requirements.json`, the Gherkin, and the Kiro triad are untouched.
  `:build` and `:next` skip anything in `cut_features` by cross-reference, not by the spec
  folder changing shape underneath them.

---

## 6. The agents

| Agent | Model | Tools | Justification |
|---|---|---|---|
| `deploy-engineer` | Opus | Read, Write, Edit, Bash | Dockerfiles, Terraform, CI, and the actual deploy + verification call — one large focused chunk that must not leak into the main context |
| `compliance-checker` | Sonnet | Read, Grep, Glob, Bash | Mechanical, evidence-gathering, high-volume search — exactly the shape Sonnet is right-sized for, per the parent design's model table |

Both match the parent design's agent table exactly (§9) — M4 adds no new agent beyond what
was already scoped there. **Still deliberately absent: an implementation agent.** `:build`
calls `superpowers:subagent-driven-development`; nothing about M4 changes that decision.

---

## 7. The skills

Four ship skills, all **prose playbooks, not code** — same authorship pattern as M3's
design/engineering skills.

| Skill | Content |
|---|---|
| **`deploy-targets`** | Selection criteria and time-to-first-URL for each: Vercel, Cloud Run, Railway, Render, AWS, Docker Compose (local-only fallback). The sponsor-wins precedence rule from `:stack` applies here too — a mandated cloud is never traded for a faster default |
| **`containerization`** | Per-service, multi-stage `Dockerfile`s; image size under time pressure; the `next-monolith` vs `multi-service` shape each imply a different Dockerfile count |
| **`cicd-github-actions`** | Path-filtered per-service deploy workflows (only the changed service's pipeline runs); keyless auth via WIF/OIDC; test-then-deploy job ordering |
| **`iac-terraform`** | Module layout — network, database, iam, storage, messaging, budget — sized for a project with a two-day lifespan, not a production system; state management that doesn't assume a long-lived backend |

### Evidence base

M4 does not run a fresh corpus pass — the relevant evidence was already gathered during
M2's twelve-winner review and is on record: per-service `Dockerfile`, Terraform in
`infra/`/`infrastructure/`, path-filtered per-service GitHub Actions workflows, and keyless
cloud auth via WIF/OIDC, observed in both `kintwadi` and `karma`. These four skills encode
that evidence rather than re-derive it. Deploy target varies by sponsor in both reference
repos — Vercel, Cloud Run, Railway, Render and AWS all appear across the two — which is why
`deploy-targets` is a selection table, not a single recommendation.

---

## 8. Hooks

Three remaining hooks, completing the four the parent design specifies (§11). SessionStart
shipped in M1; these three ship here.

### `UserPromptSubmit` — deadline pressure

No matcher — runs on every prompt, dispatched through the same `run-hook.sh` pattern as
`inject-state`. Exits silently and immediately when `.hackathon/` is absent, same contract
`inject-state.mjs` already holds.

- `hours_remaining = (hackathon.deadline − now) / 3600000`.
- Silent unless `hours_remaining < 0.25 × budget.total_hours`, **or** the current
  `in_progress` phase's elapsed time (`now − phases[current].started_at`) exceeds its
  `budget.phase_budget` entry.
- On trigger: one short note plus, only when a phase is over its own budget (not just
  overall time), a suggestion to run `:pivot`. Rare by design, per the parent rationale — "a
  warning on every prompt is a warning nobody reads."

### `PostToolUse` — progress stamping

Matcher `Bash`, condition `Bash(git commit:*)`.

- Recomputes `budget.spent_hours = (now − hackathon.started_at) / 3600000` — wall-clock
  elapsed, not effort. This is Open Question 4 of the parent design made concrete: it is an
  honest proxy, stated as one, not a claim of measuring work done.
- Records `budget.last_commit = { at: now, sha: <commit sha> }`.
- **Knock-on to M2:** `hackathon.started_at` does not exist before M4. Added as a small,
  additive change to `recon-apply.mjs`, stamped at the same point `:recon` already asks
  "total hours available" — the natural moment the clock starts. Same shape as M3 Stage 2
  pulling forward nine Stage-1 minors: a small fix to already-shipped code, done inside the
  milestone that needs it, not deferred to a stage that doesn't touch that file.

### `Stop` — the challenges log

If the session shows substantial tool activity and `challenges.md` was not modified, emits a
reminder. The reminder **names the specific failures the transcript actually shows** — a
non-zero exit, a failing test's own output — scanned from the session transcript, not a
generic "did you hit any issues?" nag. This is Rule 2 enforced mechanically, per the parent
design, and matches its explicit requirement that the reminder "names the specific failures
observed in the session so the entry can be written from fact."

---

## 9. Test surface

Most of M4 is code, not prose, which stayed the right defense against the class of bug M2's
plan paid for (see the M2/M3 project memory: prose tests that grep for keywords are usually
unfalsifiable). The two genuinely prose surfaces below get the same section-scoped,
mutation-proven treatment M3 established.

**Scoped exception, decided at the final whole-branch review:** the four ship skills
(`deploy-targets`, `containerization`, `cicd-github-actions`, `iac-terraform`) are
selection-criteria and reference-table prose, not claims about a real project — Task 12's
own fix already confirmed none of the four makes an unattributed claim about `kintwadi` or
`karma`. The harsh M2/M3 keyword-presence rule exists specifically to guard against a
false claim about a real project passing unnoticed; that risk doesn't apply to a target
selection table. These four skills' tests are held to a lighter bar instead: real keyword
checks with `\b` word-boundary anchors (so `/Render/` cannot pass on the word "Rendered"
inside unrelated prose — the exact class of bug this project's own history already
flagged), not full `content.slice()`-scoped position assertions. Any future skill that
*does* make a specific claim about a real project still gets the full M2/M3 treatment —
this exception is scoped to "selection criteria with no per-project claim," not to "any
skill in the ship category."

**Mechanical, tested normally:**

- `deploy-schema.mjs` — every rule in §3 gets a passing and a failing case, including the
  "every deployable stack slot has a matching service" and "`verified: true` requires
  `verified_at` + `verification_method`" rules
- `build-apply.mjs` — feature-list derivation (must + not-cut, array order), `tasks.md`
  checkbox-completion parsing (including a partially-ticked file correctly reporting
  not-done), context-bundle assembly — all pure functions, no agent dispatch required
- `compliance-apply.mjs` — the overwrite/merge logic against fixture evidence (not the
  agent's own grep judgment, same split M3 used for `solution-architect`'s
  `architecture.json` versus the renderers that consume it)
- `pivot-apply.mjs` — the cut-ranking algorithm: orphan-criterion protection (a feature that
  is the sole claim on a criterion must never appear in the proposed list), remaining-time
  math, and the `cut_features` append — the highest-value TDD target in this milestone, since
  it is pure logic with real consequences and no agent involved at all
- hook math lives in a `scripts/lib/` module with an injectable `now` parameter, the same
  convention `recon-apply.mjs`'s `buildHackathonDigest(recon, { now = new Date() })`
  already uses — not the invented "never `Date.now()`" rule this section first claimed.
  The thin hook script in `hooks/` calls that lib function with the real clock and is
  itself tested the way `inject-state.mjs` already is: spawned as a subprocess against
  fixed far-future/near/past fixture deadlines, asserting on presence/absence of the
  warning and on structural bounds (line count, no crash), never an exact computed hour
  count. The lib function gets ordinary injected-`now` unit tests on top of that
- v3 → v4 migration — additive, idempotent, still refusing a version newer than it knows
- non-destructive writes for every new file `:ship` produces — backup created,
  `--dry-run` writes nothing, marked-block rerun touches only the plugin's block

**Prose, tested under the M2/M3 rules:**

- the four new skill files — assertions scoped to their section via
  `content.slice(indexOf(…), indexOf(…))`, asserting position, not keyword presence
- every prose test proved by mutating the file until it fails
- `\b` on every short pattern
- any claim a skill makes about `kintwadi` or `karma` checked against the M2 corpus
  reference rather than asserted fresh

---

## 10. Amendments to `win-hackathon-plugin.md`

| Section | Amendment |
|---|---|
| §4 State schema | v3 → v4; adds `hackathon.started_at`, `project.cut_features`, `project.deploy`, `budget.last_commit` |
| §8 `:build` | Reads the Kiro triad and Gherkin as context, `tasks.md` as the executable plan handed to `subagent-driven-development`; skips `cut_features`; runs `:check` after each feature |
| §8 `:check` | Overwrites `state.json.compliance` in place; no new payload or rendered file |
| §8 `:ship` | Emits a validated `deploy.json`; `state.json.project.deploy` is a digest+ref. Gate requires a curl-verified 2xx on every service URL |
| §8 `:pivot` | Ranks cut candidates by judging-criterion exposure using `requirements.json`'s existing `criterion_refs`; never proposes cutting a criterion's sole feature; `requirements.json` itself is never mutated |
| §9 Agents | `deploy-engineer` and `compliance-checker` land as specified — no changes to the parent design's table |
| §10 Skills | Four ship skills land as specified; evidence inherited from M2's corpus pass, no fresh review |
| §11 Hooks | `UserPromptSubmit`, `PostToolUse`, `Stop` land, completing all four hooks the parent design specifies |
| §13 Plugin layout | Four commands, two agents, four skills, and the new `scripts/lib` modules (`deploy-schema.mjs`, `build-apply.mjs`, `compliance-apply.mjs`, `pivot-apply.mjs`, `ship-apply.mjs`) |
| §14 Staging | M4 delivers in two stages; both land before M4 is done |

---

## 11. Delivery

One spec, all four commands, everything ships — same call as M3: split the delivery, but
the spec covers everything and all of it ships. Two implementation stages, so review stays
honest; the split is a review boundary, not a scope cut.

**Stage 1 — `:build` and `:check`.** State v4 and its migration (the `hackathon.started_at`
/ `cut_features` / `deploy` fields — `budget.last_commit` lands with Stage 2's hooks);
`build-apply.mjs` (feature derivation, `tasks.md` parsing, context-bundle assembly);
`compliance-apply.mjs` and the `:check` overwrite logic; the `compliance-checker` agent; the
`:build`/`:check` command files.

**Stage 2 — `:ship` and `:pivot`.** `deploy.json` contract and validator; `ship-apply.mjs`
(target selection, deploy + curl verification, degradation paths); `pivot-apply.mjs` (the
cut-ranking algorithm); the `deploy-engineer` agent; the four ship skills; the three
remaining hooks (`UserPromptSubmit`, `PostToolUse` — including the `recon-apply.mjs`
knock-on — and `Stop`); the `:ship`/`:pivot` command files.

**Milestone check.** M4 is done when, from a clean project with an approved `:spec`,
`:build` runs every must-have feature to green with `:check` passing after each; `:pivot`
proposes a cut list that never zeroes a judging criterion and correctly refuses to touch
`requirements.json`; and `:ship` produces a running, `curl`-verified local URL. Per the
validation decision below, that last check runs against the Docker Compose target, not a
real cloud deploy — a real cloud deploy against Vercel or Cloud Run is a one-time human
check run before declaring M4 done, the same treatment M3 gave opening the drawio output by
hand.

**Validation target: Docker Compose, not a real cloud deploy.** A live deploy needs live
credentials wired into whatever runs the check and costs real money and time on every run;
Compose is one of `:ship`'s own first-class targets, not a workaround, and validates the
full mechanics — Dockerfile generation, compose-up, curl-verified reachability, `deploy.json`
and `state.json` written correctly — with nothing external required. This makes the
milestone check fully repeatable in CI, at the cost of never automatically exercising the
vendor-CLI + WIF/OIDC path, which is why that path gets an explicit one-time human check
instead of an automated one.

---

## 12. Open questions

1. **Whether all four spec surfaces survive M4 — resolved.** M3 asked this; the answer is
   no. `:build` reads the Kiro triad and Gherkin; `openspec/changes/<slug>/` is not read by
   anything in M4. It stays as a standalone artifact for a human driving the CLI directly.
   Nothing about `:spec` changes — this only closes the question it left open.
2. **`:pivot`'s criterion-exposure ranking has no real-hackathon evidence yet.** It is a
   reasonable mechanical rule built from `requirements-schema.mjs`'s own validation logic,
   but no archived hackathon in the corpus was actually re-scoped mid-build under this
   plugin, so whether the ranking matches what a human would actually choose to cut is
   untested until M4 is exercised for real.
3. **Static-secret auth as a documented fallback risks becoming the default by omission.**
   The schema allows it and the command file is required to flag it as degraded, but nothing
   mechanically prevents a future edit from treating it as equivalent to WIF/OIDC. Worth a
   test asserting the command file's wording specifically, not just that the field exists.
4. **Wall-clock-since-`started_at` as the only budget signal.** `PostToolUse` only fires on
   `git commit` — a long research/debugging stretch with no commits reads as zero elapsed
   time to `budget.spent_hours`, understating pressure exactly when it is highest. The
   parent design already flags wall-clock-from-commits as a proxy (Open Question 4); M4
   inherits that limitation without improving on it.
