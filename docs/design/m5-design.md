# win-hackathon M5 — Design

**Status:** approved 2026-08-31
**Covers:** phases 9–10 — `:review`, `:submit` — plus the one remaining utility command,
`:log`
**Amends:** §4, §8, §9, §10, §14 of `win-hackathon-plugin.md`
**Predecessor:** `m4-design.md` (phases 7–8, shipped 2026-08-31)

---

## 1. Scope

M5 covers the two phases between a live URL and a finished Devpost submission, plus the
one utility command every prior milestone deferred. After M5 the plugin takes a hackathon
from a shipped, sponsor-tech-verified application to a judge-ready repository and a filled
submission form — the "Complete" outcome the parent design promises at this milestone
(§14).

| Phase / utility | Command | Payload | Rendered / written surfaces |
|---|---|---|---|
| 9 | `:review` | `review.json` | `.hackathon/review.md` |
| 10 | `:submit` | `submission.json` | `README.md`, `docs/DEMO_RUNBOOK.md`, `.hackathon/submission.md`, `.hackathon/video-script.md`, `.hackathon/screenshots.md` |
| — | `:log <text>` | *(none — appends to an existing file)* | `.hackathon/challenges.md` |

Two new validated payloads, following the `stack.json` / `architecture.json` /
`requirements.json` / `deploy.json` pattern every milestone since M2 has used for its
judgment phases. `:review` and `:submit` are both real one-time judgments with structured
output another surface needs to cite precisely (`:submit` cites `review.json`'s clean
verdict; the README cites `deploy.json`'s URL) — the same test M4 (§2) used to keep
`:ship` in the pattern while excluding `:check`/`:pivot`. `:log` stays a plain append, the
same shape as `:pivot` writing to `decisions.md`: no payload, because there is no judgment
to render twice.

### File layout

```
.hackathon/
  review.json                 findings from /code-review + quality-reviewer, one list
  review.md                   rendered from review.json — blocking / should-fix / post-hackathon
  submission.json             one payload feeding all five surfaces below
  submission.md                Devpost form fields, organized by the platform's own steps
  video-script.md              shot list with timings — production aid, not judge-facing
  screenshots.md               shot list mapped to judging criteria — production aid
  challenges.md                (existing file — :log's append target, unchanged shape)

docs/
  DEMO_RUNBOOK.md              judge-facing reproduction guide

README.md                      judge landing page — first surface a judge opens
```

`video-script.md` and `screenshots.md` are production aids, not showroom content — nobody
judging the project reads a shot list, they watch the video and see the screenshots it
produces. They stay in `.hackathon/` for that reason, alongside `review.md`, which is
similarly a workshop artifact (judges don't read a self-review). `README.md` and
`docs/DEMO_RUNBOOK.md` are the only judge-facing surfaces `:submit` writes, matching §3 of
the parent design exactly.

### Dependency chain

```
deploy.json ──────────────────────────────────────────────────────────► README.md (live URL)
review.json (clean) ───────────────────────────────────────────────────► :submit may proceed
challenges.md ──────────────────────────────────────────────────────────► submission.md ("Challenges we ran into")
state.deliverables.submission_requirements + recon.json ─────────────────► submission.md tracker
state.deliverables.bonus_content ─────────────────────────────────────────► submission.md bonus section
recon.json.submission_form ────────────────────────────────────────────────► submission.json char-limit validation
```

`:submit` is the one command in the plugin that reads from every prior phase's output at
once — `recon.json` (submission form + bonus mechanics), `stack.json` (why this tech),
`architecture.json` (the diagram to embed), `deploy.json` (the URL), `challenges.md`
(what went wrong), `state.deliverables` (what's still owed) — because it is the phase that
assembles everything else into what a judge actually reads. Nothing new is computed here;
this is the render step for the whole hackathon.

---

## 2. Why `:log` breaks the contract-then-render pattern

Same reasoning M4 gave for `:pivot`: `:log`'s output is an instruction to a file that
already exists (append this entry), not a new judgment. A `log.json` would just be
`challenges.md`'s content duplicated with an extra render step — the exact anti-pattern
M4 rejected for `:check`. `:log <text>` appends a timestamped line to `challenges.md`
using the template `init-plan.mjs` already writes at `:init` time; nothing about its shape
changes in M5.

---

## 3. The `review.json` contract

```jsonc
{
  "schema_version": 1,
  "findings": [
    {
      "id": "REV-1",
      "source": "code-review" | "quality-reviewer",
      "severity": "blocking" | "should-fix" | "post-hackathon",
      "title": "Protected-by-default route group missing on /admin/reports",
      "summary": "…",
      "file": "src/app/admin/reports/page.tsx",   // nullable — architecture findings may cite no single file
      "line": 14,                                  // nullable
      "judge_visible": true
    }
  ]
}
```

**Validation rules (`review-schema.mjs`):**

- Every finding needs a unique `id`, a `source` and `severity` from the enums above, and a
  non-empty `title` + `summary`. `file`/`line` are nullable — an architecture-level finding
  ("no invariant enforces tenant isolation on the new export route") may not reduce to one
  call site.
- No `verdict` field is stored. Whether the review is clean is `!findings.some(f =>
  f.severity === 'blocking')`, computed at render time and at the `:review` gate — storing
  it separately is exactly the two-sources-of-truth class of bug the M3 final review spent a
  fix wave closing (see the M3 project memory on Kiro spec-folder identity).
- `judge_visible` is required, not inferred at render time, because the person best placed
  to judge "is this on the demo path" is the reviewer with the diff in front of it, not a
  renderer working from a boolean-free finding after the fact.

**Classification rule**, codified in the `quality-reviewer` agent prompt and the
`/code-review` invocation's own framing rather than the schema (the schema only constrains
the *shape*, not who calls something blocking): **blocking** = a correctness bug or
security-invariant violation reachable from the judge's actual path (the demo route, the
README, the deploy target) or a false required-sponsor-tech claim; **should-fix** = real
but off that path, or a simplification/efficiency finding with concrete impact;
**post-hackathon** = a nice-to-have, style, or no-user-visible-effect refactor. `review.md`
orders findings blocking-first, then by `judge_visible` within each severity — not by file
path.

---

## 4. The `submission.json` contract

One payload, five renderers — the third time this shape pays off after `architecture.json`
(→ 3 diagrams + 2 docs) and `requirements.json` (→ 4 surfaces).

```jsonc
{
  "schema_version": 1,
  "readme": {
    "tagline": "…",
    "thesis_quote": "…",              // sponsor-tech-thesis inversion line — rendered as
                                        // the first blockquote, before any results table
    "problem": "…",
    "features": [{ "title": "…", "description": "…" }],
    "security_summary": "…",           // points at AGENTS.md, does not restate it
    "demo_data_note": "…",             // nullable — only when synthetic/illustrative data is used
    "hackathon_disclosure": null       // or { "required_stack": [{ "claim": "…", "evidence": "…" }] }
  },
  "runbook": {
    "prerequisites": ["…"],
    "quick_start_steps": ["…"],        // no-account path, target: under 1 minute
    "manual_walkthrough": [{ "step": 1, "instructions": "…", "expected": "…" }],
    "troubleshooting": [{ "symptom": "…", "fix": "…" }],
    "reset_procedure": "…",
    "expected_duration_minutes": 25
  },
  "devpost_form": {
    "fields": [{ "id": "about", "text": "…" }],   // id matches recon.json.submission_form.fields[].id
    "challenges": "…",                              // assembled from challenges.md, not paraphrased
    "requirements_tracker": [
      { "id": "demo-video", "requirement": "…", "status": "done" }
    ],
    "bonus_tracker": [
      { "id": "bonus-1", "kind": "…", "platform": "…", "url": "…", "status": "done" }
    ]
  },
  "video_script": {
    "total_seconds": 170,
    "shots": [{ "label": "hook", "seconds": 15, "script": "…", "on_screen": "…" }]
  },
  "screenshots": {
    "shots": [{ "id": "…", "criterion_ref": "…", "instructions": "…" }]
  }
}
```

**Validation rules (`submission-schema.mjs`):**

- Every `devpost_form.fields[].id` must exist in `recon.json.submission_form.fields[]`
  (cross-check against the caller-supplied `recon`, same `options.recon` pattern
  `requirements-schema.mjs` already uses), and `text.length` must not exceed that field's
  `limit` when one is recorded — the same length discipline kintwadi's real submission.md
  applies by hand (verified-length alternatives table), made mechanical.
- `video_script.shots[].seconds` must sum to `total_seconds`, and `total_seconds` must not
  exceed 180 — the corpus finding this plugin already ships (`demo-video-script`'s
  "sub-three-minute structure") becomes a validation failure, not just advice, if a draft
  script runs long.
- `requirements_tracker` must include every `id` present in
  `state.deliverables.submission_requirements` (the hard, gating ones `:recon` seeded) —
  an item silently missing from the tracker is exactly how a required field gets forgotten
  at the actual submission gate.
- `bonus_tracker[].status === 'done'` requires a non-null `url` — a bonus piece is not
  "delivered" without the published link `:submit` is supposed to record (§12 of the parent
  design: "`:submit` delivers and records the published URLs").

`state.json.project.submission = { "requirements_complete": true, "ref":
".hackathon/submission.json" }` and `state.json.project.review = { "clean": true, "ref":
".hackathon/review.json" }` mirror `project.stack`/`project.deploy`'s digest-plus-ref shape:
the one fact `:status` and hooks need, without opening a second file.

---

## 5. State schema v4 → v5

Additive only, same migration shape as every prior version bump. (Correction against my
own design proposal in chat: M4 already claimed v4 — `CURRENT_SCHEMA_VERSION` is `4` on
`main` as of this writing — so M5 is v4 → v5, not v3 → v4.)

```jsonc
{
  "schema_version": 5,

  "project": {
    // new — digest + ref, mirrors project.stack and project.deploy
    "review": { "clean": true, "ref": ".hackathon/review.json" },
    "submission": { "requirements_complete": true, "ref": ".hackathon/submission.json" }
  }
}
```

**v4 → v5 migration:** additive and idempotent, same test shape as v2→v3 and v3→v4.
`project.review` defaults to `{ clean: null, ref: null }`; `project.submission` defaults to
`{ requirements_complete: false, ref: null }`.

No other field changes. `deliverables.submission_requirements`/`bonus_content` were already
validated in v2/v4 respectively and need no schema change here — `:submit` is a new
*consumer* of both, not a new producer of their shape.

---

## 6. The commands

### `:review`

- **Step 1 — check inputs.** `.hackathon/deploy.json` must exist and be `approved` (or the
  user is explicitly reviewing an unshipped state, same "not this command's job to block
  outright, only make sure the choice is knowing" treatment `:ship` gives an unfinished
  `:build`).
- **Step 2 — code-level pass.** Invoke the existing `/code-review` skill against the
  branch/diff. Not reimplemented, not wrapped — called directly, same principle as `:build`
  calling `superpowers:subagent-driven-development` rather than growing its own TDD loop.
- **Step 3 — architecture-level pass.** Dispatch `quality-reviewer` — boundary violations,
  `AGENTS.md` invariants asserted but not enforced, unmanaged failure modes, security
  posture. Reads broadly (`Read`, `Grep`, `Glob`, `Bash`), writes nothing itself; returns
  findings in `review.json`'s shape.
- **Step 4 — merge and write.** Both passes' findings become one `review.json` (`REV-`
  IDs assigned in pass order), validated, then rendered to `review.md`.
- **Step 5 — the gate.** If any finding is `severity: "blocking"`, `phases.review` stays
  `in_progress` with a `resume_note` listing the blocking IDs — the same "not shipped on
  faith" mechanics `:ship` already uses for an unreachable URL. Only once a re-run finds
  zero blocking findings does the phase reach `awaiting_approval`. `should-fix` and
  `post-hackathon` findings never block — "under deadline pressure, only blocking items are
  mandatory" (parent design §8) is enforced structurally here, not left as a reading of
  `review.md`.

### `:submit`

- **Step 1 — check inputs.** `project.review.clean` must be `true` — `:submit` refuses to
  assemble a submission around known-blocking findings, the same posture `:ship` takes
  toward an unverified URL.
- **Step 2 — re-run `:check`.** Calls `check.mjs apply` fresh (per `check.md`'s own
  forward reference: "the calling context … or `:submit` in M5" decides what an unverified
  compliance report means). A required-tech regression introduced after `:ship` is caught
  here, not discovered by a judge.
- **Step 3 — dispatch `submission-writer`.** Must explore the *built* application (not just
  read specs) to write an accurate runbook and feature list — the agent table's existing
  justification, unchanged. Returns `submission.json`.
- **Step 4 — validate and render.** `submission-schema.mjs` validates against the live
  `recon.json` (field limits) and `state.deliverables` (every gating requirement present).
  On success, renders all five surfaces (§4) and marks delivered `submission_requirements`
  / `bonus_content` entries `done` in `state.json` (never regenerating `recon.json` or
  `challenges.md` — this step only reads them).
- **Step 5 — the gate.** Refuses to reach `awaiting_approval` while any
  `submission_requirements` item is not `done` or `skipped`. A `skipped` item requires a
  `decisions.md` entry (the same trail `:pivot` already leaves for a cut feature) — silence
  is not an acceptable reason to drop a hard submission requirement.

### `:log <text>`

Appends `## <ISO timestamp> — <text>` to `.hackathon/challenges.md`, newest last (matching
the file's existing convention). No approval gate — it is a running log, not a judgment.

---

## 7. The agents

| Agent | Model | Tools | Justification |
|---|---|---|---|
| `quality-reviewer` | Opus | Read, Grep, Glob, Bash | Reads broadly; must not carry implementation bias — matches the parent design's table exactly |
| `submission-writer` | Opus | Read, Grep, Glob, Bash, Write | Must explore the built app to write an accurate runbook — matches the parent design's table exactly |

Both match §9 of the parent design with no changes. M5 adds no agent beyond what was
already scoped there. **Still deliberately absent: an implementation agent** — nothing
about M5 touches that decision.

---

## 8. The skills

Four submission skills, grounded in `kintwadi` and `karma`'s actual shipped files (read in
full for this design, not recalled from the M2 corpus summary — see §9 for what was found).

| Skill | Content |
|---|---|
| **`judge-ready-readme`** | Live-demo-link-first; tagline as an italic blockquote; the tech-thesis quote placed in the *first screen*, before any results/badges table; badges row; features table; a security section that *points at* `AGENTS.md` rather than restating it; an optional "Note on demo data" disclaimer; an optional "Hackathon Disclosure" required-stack checklist section for sponsor-tech tracks |
| **`demo-runbook`** | **Judge Quick-Start (no account required)** as its own top section, target under 1 minute, naming the exact idempotent seed call; a separate, slower **Full Manual Walkthrough** as numbered steps each with a stated "you should see" assertion; a **Troubleshooting** symptom/fix table; a golden-run/reset fallback for when the live environment degrades |
| **`devpost-submission`** | Organized by the platform's own form steps, not by the plugin's own headings; paste-ready fields with character counts verified against `recon.json`'s recorded limits; a requirements tracker synced from `deliverables.submission_requirements` plus the bonus items; "challenges we ran into" assembled from `challenges.md` verbatim |
| **`demo-video-script`** | Sub-three-minute structure (hook → problem → demo → technical depth → close), each shot with a timing budget summing to the cap; the platform's own video requirements (e.g. "must name the required sponsor tech") as an explicit checklist, not just an edit |

### Evidence base

A fresh read of `kintwadi/README.md`, `kintwadi/AGENTS.md`, `karma/README.md`,
`karma/docs/DEMO_RUNBOOK.md`, and `zero-hackathon/submission.md` (the real Devpost
working doc for kintwadi), done for this design rather than relying on the M2 corpus
summary. What each skill above encodes, and where it came from:

- **The thesis-quote-first placement** is not just an M3 finding about heading order —
  both repos place it as the literal first prose after the title block. Karma: "Built on
  Google Cloud's Vertex AI Agent Builder…" is a blockquote at line 25, before the results
  table. Kintwadi: "Which AWS database, and why" is section two, immediately after "What it
  is."
- **The Judge Quick-Start pattern** is verbatim in both runbooks — karma's
  `docs/DEMO_RUNBOOK.md` names the section exactly `## Judge Quick-Start (no account
  required)` and states "under 1 minute, no Google account needed" before the first
  numbered step.
- **The golden-run/reset fallback** is new evidence beyond the M2 corpus summary: karma's
  runbook has both a `./scripts/reset-demo.sh` step and a separate `golden-run-snapshot.sh
  restore` for when the live environment is unavailable — directly motivated by the
  README's own caveat that the Dynatrace trial tenant expires. Worth teaching as a general
  pattern (a live demo can degrade before judging ends), not a karma-specific note — folded
  into `demo-runbook`'s golden-run/reset fallback above.
- **The "Hackathon Disclosure" section** is new evidence: karma's README closes with an
  explicit required-stack compliance checklist ("Powered by Gemini… Built with Google Cloud
  Agent Builder… Integrates the partner's MCP server…"). Kintwadi's README has no
  equivalent section. `judge-ready-readme` treats it as optional, not universal — present
  it when the hackathon's rules name specific required technology to disclose, per
  `recon.json.tech.required`.
- **The devpost-submission-as-form-steps structure** is new evidence: kintwadi's actual
  working doc opens "Master working doc for the Devpost submission form. Fill each form
  step from the matching section below," and its Step 1 section is a paste-ready text
  block plus an alternatives table with verified character counts and a stated
  recommendation and reasoning — exactly the shape `devpost_form` (§4) is built to hold.
- **The requirements tracker** is new evidence directly confirming the plugin's own
  pre-built infrastructure: kintwadi's submission doc has a literal "Submission
  requirements tracker (from the official 'What to submit')" checklist, including the
  bonus-content line — this is `state.deliverables.submission_requirements` /
  `bonus_content` rendered by hand, which `:submit` now automates.

---

## 9. Test surface

Same treatment M3/M4 established: mechanical logic gets ordinary TDD; prose gets
section-scoped, mutation-proven assertions, not keyword grepping.

**Mechanical, tested normally:**

- `review-schema.mjs` — every rule in §3, including "no stored verdict" (the renderer's
  clean/blocking computation gets its own test, independent of any specific findings list)
- `submission-schema.mjs` — the `recon.json` field-limit cross-check (a field over its
  limit fails validation), the video-script seconds-sum-and-cap rule, the
  `deliverables.submission_requirements` completeness cross-check, the
  `bonus_tracker[].status === 'done'` → non-null `url` rule
- `review-apply.mjs` — the merge of two findings sources into one ID-assigned list; the
  gate logic (any blocking → stays `in_progress` with `resume_note`; zero blocking → phase
  advances)
- `submission-apply.mjs` — the five-surface render dispatch; marking `deliverables` entries
  `done`; refusing to advance while any hard requirement is `not_started`/`in_progress`
- `log-apply.mjs` — the append format, including that a re-run never rewrites prior entries
- v4 → v5 migration — additive, idempotent, still refusing a version newer than it knows
- non-destructive writes for `README.md` (may already exist from a prior manual edit —
  backup-before-write and `--dry-run` apply here exactly as they do to every other
  `:init`-adjacent write)

**Prose, tested under the M3/M4 rules:**

- the four submission skill files — assertions scoped to their section via
  `content.slice(indexOf(…), indexOf(…))`, asserting position not keyword presence
- every prose test proved by mutating the file until it fails; `\b` on every short pattern
- the evidence-base claims about `kintwadi`/`karma` in §8 above checked against the actual
  files read for this design (not re-derived from memory a second time) — any skill
  wording that cites a specific line, section name, or file from either repo must match
  what §8 recorded, the same discipline the M2/M3 corpus citations already follow

---

## 10. Amendments to `win-hackathon-plugin.md`

| Section | Amendment |
|---|---|
| §4 State schema | v4 → v5; adds `project.review`, `project.submission` |
| §8 `:review` | Emits validated `review.json`; merges `/code-review` + `quality-reviewer` findings; gate requires zero blocking findings, mechanically enforced |
| §8 `:submit` | Emits validated `submission.json` feeding five surfaces; gate requires `project.review.clean` and every hard `submission_requirements` item `done`/`skipped` |
| §8 `:log` | Lands as specified — plain append, no payload |
| §9 Agents | `quality-reviewer` and `submission-writer` land as specified — no changes to the parent design's table |
| §10 Skills | Four submission skills land as specified; evidence is a fresh read of `kintwadi`/`karma`'s real files, not the M2 corpus summary |
| §14 Staging | M5 delivers in two stages; both land before M5 — and the whole five-milestone table — are done |

---

## 11. Delivery

Same call as M3/M4: one spec, everything ships, two implementation stages so review stays
honest.

**Stage 1 — `:review` and `:log`, plus one pulled-forward fix.** `review-schema.mjs` and
`review-apply.mjs`; the `quality-reviewer` agent; the `:review`/`:log` command files; state
v5's `project.review` field and its migration slice. Also: `scripts/lib/init-apply.mjs`
swapped from the raw `backupFile()` to the collision-safe `openBackupSet` the other four
modules already use — a known M3 leftover, mechanical, done here because M5 is explicitly
the milestone that closes out what's left open (same treatment M4 gave pulling forward
nine Stage-1 minors in M3 Stage 2, and the `hackathon.started_at` knock-on in its own
Stage 2).

**Stage 2 — `:submit`.** `submission-schema.mjs` and `submission-apply.mjs` (the five-
surface render dispatch); the `submission-writer` agent; the four submission skills; state
v5's `project.submission` field. Depends on Stage 1 only for the schema-version bump
landing first (both `project.review` and `project.submission` are part of the same v4→v5
migration) — otherwise independent.

**Milestone check.** M5 is done when, from a project with an approved `:ship`, `:review`
correctly refuses to advance past a seeded blocking finding and then advances once it's
resolved; and `:submit` — run against a project with every hard submission requirement
marked `done` — produces all five surfaces, correctly refuses when one requirement is left
`not_started`, and correctly accepts when that requirement is `skipped` with a
`decisions.md` entry. Reproducing a `kintwadi`- or `karma`-shaped project end-to-end from a
clean directory (§14 of the parent design's stated M4–M5 validation target) is a one-time
human check run before declaring M5 done, the same treatment M3 gave the drawio output and
M4 gave the real cloud deploy — not part of the automated milestone check.

---

## 12. Open questions

1. **The blocking/should-fix/post-hackathon classification rule lives in agent prompt
   wording, not the schema.** The schema only constrains shape (§3), so a `quality-reviewer`
   prompt revision could drift the classification without any test catching it structurally.
   Worth a prose test on the agent file itself, same section-scoped treatment as the skills.
2. **No real-hackathon evidence yet that the two-pass merge (`/code-review` +
   `quality-reviewer`) doesn't double-report the same finding from two angles.** Both read
   the same diff; nothing in `review-apply.mjs`'s merge step deduplicates by file:line. If
   this proves noisy in practice, a dedup pass is a candidate follow-up, not designed here.
3. **`hackathon_disclosure` being optional, keyed off `recon.json.tech.required`, is a
   judgment call with only one data point (`karma`) for and one against (`kintwadi`, which
   had no sponsor-tech disclosure requirement in H0's rules the way Google's Rapid Agent
   Hackathon apparently did).** Whether "optional, present when required tech exists" is
   the right trigger — versus, say, always-on — is untested until M5 runs against a
   hackathon with a different disclosure rule shape.
