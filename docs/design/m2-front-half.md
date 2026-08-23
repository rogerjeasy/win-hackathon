# win-hackathon M2 — Front Half

**Status:** Approved design, ready for implementation planning
**Date:** 2026-08-22
**Author:** Roger Jeasy Bavibidila
**Extends:** `win-hackathon-plugin.md` (§8 `:recon`/`:brainstorm`/`:describe`, §4 state schema, §10 skills)

---

## 1. Scope

M2 delivers the front half of the workflow: `:recon`, `:brainstorm`, `:describe`, and the
five skills they load. After M2 the plugin replaces the manual ideation loop end to end —
Devpost URL in, a scored idea shortlist and a written win-strategy out.

M2 does **not** add `:check`, `:stack`, or any build phase. It does add the instrument
those later phases measure against: a machine-readable judging rubric.

### What changed after the evidence review

The approved design specified these three commands in a paragraph each. Reviewing twelve
winning Devpost submissions and two of our own repositories showed the specification was
too thin in three specific ways, and this document is the correction:

1. `:recon` extracted roughly half of what actually decides outcomes.
2. `:describe` produced a product description where winners produce a win strategy.
3. Nothing captured the judging criteria in a form a later phase could score against.

---

## 2. Evidence base

Twelve winning submissions across three hackathons, plus `examples/karma` and
`examples/zero-hackathon` in this workspace.

| Project | Hackathon | Prize |
|---|---|---|
| Waylo | H0: Hack the Zero Stack | 1st — Monetizable B2C |
| Sammy | H0 | 1st — Monetizable B2B |
| Sonar | H0 | 1st — Million-scale Global |
| HYPE | H0 | Best Technical Implementation |
| Relay | H0 | Most Impactful |
| Kintwadi | H0 | Best Design *(ours)* |
| Cassandra | Google Cloud Rapid Agent | 1st — Arize |
| CrisisRoute | Google Cloud Rapid Agent | 1st — Elastic |
| Karma | Google Cloud Rapid Agent | 2nd — Dynatrace *(ours)* |
| BackstageCommercials | Amazon Nova AI | First Prize Overall |
| Title AI | Amazon Nova AI | Best of UI Automation |
| Project Memoria | Amazon Nova AI | Best of Multimodal Understanding |

Six of these entered the same hackathon, which gives a direct read on what separated first
place from a category prize.

### Findings that drive this design

**F1 — The sponsor-tech thesis is universal, and its placement varies with placement.**
Every H0 winner states in one line why *this specific* technology, in a form a competitor
using different technology could not claim. Sammy: Aurora is "the secure core, not a
passive store" — the trained model lives inside the database and "nothing ever leaves that
private network boundary." Sonar: "DynamoDB for speed, Aurora DSQL for record." Waylo:
"Nova only fires as a genuine last resort."

The discriminator is *placement*. Relay gave it a top-level heading at position three
("Which AWS Database — and why Aurora DSQL"); HYPE gave it two ("Why Aurora DSQL Matters",
"DSQL-Aware Engineering Decisions"); Sonar renamed a default heading around it ("How we
built it — the data model is the product"). All three took a $10,000 track first. Kintwadi
had an equally strong thesis — "the database is the thesis, not a default" — buried inside
"How we built it", and took a $2,000 category prize.

**F2 — Submission headings map to judging criteria.** Devpost's default seven headings are
a floor. Winners insert headings for the criteria they intend to win. HYPE, which won Best
Technical Implementation, used: Architecture · The Math: Proof of Solvency · Why Aurora
DSQL Matters · DSQL-Aware Engineering Decisions · Monetization Model · Path to a
$100M-Scale Opportunity · Impact · What Makes HYPE Original. Relay named its *track* in a
heading.

**F3 — Novelty is stated as an inversion or reframe.** This is a generatable form, which
makes the Originality criterion mechanical rather than aesthetic. Sammy sends the model to
the data instead of the data to the model. Waylo treats vision as a last resort rather
than a first tool. Cassandra is "an AI that watches your AIs." Karma: "Tests check the
contract you wrote down. Karma checks the contract you forgot you had." Relay reframes
estate planning as *living* continuity emergencies.

**F4 — Winners quantify.** "$3.6 trillion real estate industry"; "under 50ms at zero
marginal cost"; "74 RLS policies across 33 tables"; "2.1 billion people 60+ by 2050."

**F5 — A no-account demo is a strong lever, not a gate.** Only three of twelve advertise
one. Project Memoria and BackstageCommercials shipped no live demo at all and still won.
Read alongside the H0 rules — "Judges are not required to test the Project and may choose
to judge based solely on the text description, images, and video provided" — the written
submission carries more weight than the demo. This raises the stakes on `strategy.md`.

**F6 — No winner is a thin wrapper.** Every one has a hard technical spine: in-database
federated XGBoost, a dual-database access-pattern split, an optimistic-concurrency ledger,
a four-layer detection cascade, multi-agent contract inference over telemetry.

**F7 — Requirements hide outside the rules page.** Karma's entire readiness audit
(`examples/karma/progress/step_1.md`) came off a *sponsor's resources page*, not the rules.
Its most severe finding is ranked CRITICAL on the grounds that "these are literally
copy-pasted from the hackathon requirements. A judge will look for them." Host FAQs
likewise carry scoring language worth quoting verbatim — H0's FAQ states that "submissions
with no meaningful engineering decisions will score poorly on Technical Implementation."

**F8 — The judging panel is a strategy input.** `examples/zero-hackathon/submission.md`
records the read that steered the whole project: the judges "are overwhelmingly AWS
Database leaders… the database-architecture story is our strongest card — surface it early
and everywhere."

**F9 — There is more than one deadline.** H0's credit-request form closed three days
before submissions did, and the credits themselves expired on two further dates. A single
`deadline` field cannot represent this.

**F10 — Rules contain errors, and rules provide a remedy.** H0's prize table lists the
B2B second- and third-place prizes as eligible to "submissions that enter the Monetizable
B2C App Track" — a copy-paste error. The same rules invite a written request for
clarification before the deadline.

---

## 3. The extraction contract

Every judgment phase emits a validated JSON payload first; the markdown artifacts are
rendered from it. This is `schema.mjs`'s existing pattern — refuse to write what does not
validate — applied to domain data rather than orchestration state.

### 3.1 `.hackathon/recon.json`

```jsonc
{
  "schema_version": 1,

  "source": {
    "url": "https://h01.devpost.com",
    "pages_fetched": [
      { "path": "/", "method": "webfetch", "fetched_at": "2026-06-05T09:00:00Z" },
      { "path": "/rules", "method": "webfetch", "fetched_at": "…" },
      { "path": "/resources", "method": "playwright", "fetched_at": "…" }
    ],
    "pages_failed": [{ "path": "/updates", "reason": "404" }]
  },

  "identity": {
    "name": "H0: Hack the Zero Stack with Vercel v0 and AWS Databases",
    "host": "Amazon Web Services",
    "administrator": "Devpost",
    "theme_tags": ["Databases", "Open Ended", "Web"]
  },

  "dates": [
    { "label": "submission deadline", "at": "2026-06-29T17:00:00-07:00",
      "kind": "hard", "quote": "Submission Period: … – June 29, 2026 (5:00 pm Pacific Time)" },
    { "label": "credit request form closes", "at": "2026-06-26T12:00:00-07:00",
      "kind": "action", "quote": "you must complete the form at: … by June 26th at 12pm PT" },
    { "label": "v0 credits expire", "at": "2026-07-13T23:59:00-07:00", "kind": "informational",
      "quote": "v0 Credits … must be redeemed by July 13, 2026" }
  ],

  "stage_one": {
    "exists": true,
    "quote": "The first stage will determine via pass/fail whether the ideas meet a baseline level of viability…",
    "gates": [
      { "id": "theme-fit",    "requirement": "Project reasonably fits the theme" },
      { "id": "required-api", "requirement": "Project reasonably applies the required APIs/SDKs" }
    ]
  },

  "criteria": {
    "weighting": "equal",
    "tiebreak": "listed_order",
    "max_base_score": 5,
    "items": [
      {
        "rank": 1,
        "id": "technical-implementation",
        "name": "Technical Implementation",
        "weight": 0.25,
        "quote": "Does the project demonstrate genuine software craftsmanship? Is the chosen AWS Database …",
        "signals": ["deliberate data model", "deployment beyond a basic setup", "clean, purposeful architecture"],
        "evidence_slots": []
      }
    ]
  },

  "bonus": {
    "available": true,
    "max_points": 0.6,
    "per_item_points": 0.2,
    "max_score_with_bonus": 5.6,
    "kinds": ["blog", "podcast", "video"],
    "platforms": ["builder.aws.com", "medium.com", "dev.to", "YouTube", "LinkedIn"],
    "must_be_public": true,
    "required_disclosure": "must include language that says you created the piece of content for the purposes of entering this hackathon",
    "hashtag": "#H0Hackathon",
    "quote": "…may earn up to 0.6 additional points…"
  },

  "tech": {
    "required": [
      { "name": "AWS Database", "one_of": ["Aurora PostgreSQL", "Aurora DSQL", "DynamoDB"], "quote": "…" },
      { "name": "Vercel or v0.app deployment", "quote": "…" }
    ],
    "bonus": [],
    "forbidden": [],
    "encouraged": [{ "name": "v0", "note": "recommended for speed, not required", "quote": "…" }]
  },

  "tracks": [
    { "id": "b2c", "name": "Monetizable B2C app", "description": "…",
      "prizes": [
        { "place": "First",  "cash_usd": 10000, "other": "$10,000 AWS Credits" },
        { "place": "Second", "cash_usd": 5000,  "other": "$5,000 AWS Credits" }
      ] }
  ],

  "open_prizes": [
    { "id": "best-design", "name": "Best Design", "cash_usd": 2000, "eligible": "all submissions" }
  ],

  "prize_rules": {
    "one_prize_per_project": true,
    "quote": "Each Project is eligible to win one (1) prize."
  },

  "landscape": {
    "gallery_available": false,
    "gallery_note": "Devpost project galleries stay empty until winners are announced; per-track crowding is not observable during a live hackathon.",
    "total_participants": 8711,
    "participants_caveat": "registrations, not submissions — a weak proxy for field size",
    "entries_observed": null,
    "per_track": [],
    "observed_at": "2026-06-05T09:00:00Z",
    "prior_editions": [
      { "name": "H0 2025", "url": "…", "gallery_available": true, "entries_observed": 340,
        "per_track": [{ "track_id": "b2c", "entries_observed": 150 }],
        "winners": [{ "name": "…", "prize": "1st — B2C", "thesis": "…", "url": "…" }] }
    ]
  },

  "judges": [
    { "name": "Joseph Idziorek", "title": "Director, Product Management, AWS Databases", "org": "AWS" }
  ],
  "panel_read": "10 of 10 judges are AWS database leadership — the data-model thesis is the strongest card, and it should be surfaced early and everywhere.",

  "submission_requirements": [
    { "id": "text-description", "hard": true,
      "requirement": "text description naming the AWS Database used", "quote": "…" },
    { "id": "demo-video", "hard": true,
      "requirement": "under 3 minutes, public on YouTube, names the database, shows the app working", "quote": "…" },
    { "id": "architecture-diagram", "hard": true,
      "requirement": "shows how the application connects to back-end components", "quote": "…" }
  ],

  "submission_form": {
    "fields": [
      { "id": "project_name",   "limit": 60,   "unit": "characters" },
      { "id": "elevator_pitch", "limit": 200,  "unit": "characters" },
      { "id": "about",          "limit": null, "format": "markdown",
        "default_headings": ["Inspiration", "What it does", "How we built it",
                             "Challenges we ran into", "Accomplishments that we're proud of",
                             "What we learned", "What's next"] }
    ],
    "gallery": { "max_images": 15, "ratio": "3:2", "max_mb": 5 }
  },

  "eligibility": {
    "excluded_regions": ["Argentina", "Italy", "Philippines", "Brazil", "Quebec", "Russia"],
    "notes": ["Any Judge, or company or individual that employs a Judge"],
    "quote": "…"
  },

  "constraints": [
    { "id": "judge-testing",
      "constraint": "judges may score on the description, images and video alone; the project must be free and unrestricted to test",
      "implication": "the no-account demo path is a rule, not a nicety, and the written submission must stand alone",
      "quote": "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video provided in the Submission." },
    { "id": "new-and-existing",
      "constraint": "pre-existing projects must have adopted the required integration after the submission period opened; evidence of in-window work may be requested",
      "implication": "keep commit history inside the window",
      "quote": "…" }
  ],

  "host_guidance": [
    { "topic": "architecture diagram", "source": "/resources FAQ",
      "guidance": "Label every box with both what it is and what it does. Show direction of calls with arrows. Group cloud-provider services in a dashed box. Official icon sets and draw.io are recommended." },
    { "topic": "AI-generated code", "source": "/resources FAQ",
      "guidance": "Submissions with no meaningful engineering decisions will score poorly on Technical Implementation." }
  ],

  "ambiguities": [
    { "where": "Prizes table, Monetizable B2B second and third place",
      "issue": "the eligible-submissions column reads 'Monetizable B2C App Track'",
      "likely_reading": "copy-paste error; B2B prizes go to B2B entries",
      "remedy": "the rules invite a written request for clarification before the deadline" }
  ],

  "unresolved": []
}
```

Every extracted claim carries a `quote`. This is the compliance rule of the approved design
— a claim without a citation is unverified — applied to recon.

#### Landscape, and why it is mostly empty during a live hackathon

Devpost project galleries do not populate until winners are announced. During the
submission period `/project-gallery` is empty, so **per-track crowding is unobservable**
and `entries_observed` stays `null`. `total_participants` counts registrations, not
submissions, and is recorded with its caveat attached.

Track expected value therefore comes from prize structure, track count, and — when the
hackathon is a recurring series — `prior_editions`, whose galleries *are* populated. When
no prior edition exists, the EV estimate says so rather than manufacturing a number.

Prior-edition recon is also the highest-value thing in this block: for a recurring series
it yields a hackathon-specific corpus of winners, their theses and their heading
structures, layered on top of the generic corpus that ships with `winning-ideation`.

### 3.2 `recon-schema.mjs` validation rules

Pure function, returns `{ valid, errors }`, mirroring `schema.mjs`. Nothing writes without
it passing.

1. `criteria.items[].rank` values are contiguous `1..N`; each item has `id`, `name`, `quote`.
   `rank` is load-bearing — it is the tiebreak order, so rank 1 outweighs its nominal weight.
2. `weighting: "weighted"` → weights sum to `1.0 ± 0.001`. `weighting: "equal"` → weights are
   derived, never trusted from the agent.
3. Every `dates[].at` is ISO 8601 **with an explicit UTC offset**. Floating times are rejected.
   `Jun 30 @ 2:00am GMT+2` and `Jun 29 5:00pm PT` are the same instant; getting this wrong
   loses the hackathon outright.
4. `dates[].kind` ∈ `hard` | `action` | `informational`. Exactly one `hard` date, the
   submission deadline.
5. Every `submission_requirements[]` entry with `hard: true` carries a `quote`.
6. `landscape.entries_observed` is `null` unless `gallery_available` is `true`.
7. A non-empty `unresolved` is valid. Recon completes; the gate recites what it could not
   determine. Never guess.
8. Unknown top-level keys warn rather than fail, so a richer extraction is not punished.

### 3.3 `.hackathon/ideas.json`

```jsonc
{
  "schema_version": 1,
  "round": 2,
  "generated_at": "2026-06-05T11:00:00Z",
  "criteria_ref": ".hackathon/recon.json",
  "ideas": [
    {
      "id": "idea-07",
      "name": "CareCircle",
      "pitch": "One shared record for everyone caring for someone.",
      "angle": "social-impact",
      "stage_one": { "pass": true, "reasons": ["uses Aurora PostgreSQL as primary store", "fits B2C track"] },
      "thesis": "Caregiving is relational, transactional and access-controlled, so the database enforces permissions — a key-value store cannot.",
      "inversion": "Authorization lives in the database, not the UI.",
      "track": { "id": "b2c", "ev_note": "identical $10K to B2B; no crowding data available (gallery empty pre-announcement)" },
      "demo_moment": "The aide's view blocked from a financial document — 'blocked by the database, not the UI'.",
      "scores": [{ "criterion_id": "technical-implementation", "score": 5, "rationale": "…" }],
      "feasibility_hours": 90,
      "total": 4.75,
      "rank": 1
    }
  ],
  "disqualified": [
    { "id": "idea-03", "name": "…", "stage_one": { "pass": false, "reasons": ["no required AWS database in the design"] } }
  ]
}
```

### 3.4 `ideas-schema.mjs` validation rules

1. An idea with `stage_one.pass: false` belongs in `disqualified` and **carries no scores**.
   Gate before scoring is enforced by the validator, not by trusting the agent — scoring a
   non-compliant idea invites falling in love with it.
2. Every `scores[].criterion_id` resolves against `recon.json`'s rubric.
3. Every scored idea has a non-empty `thesis` and `inversion` (F1, F3).
4. Every scored idea has a `demo_moment` (F5 — the submission must stand alone).
5. `rank` is unique and contiguous; ties resolve by the rubric's `rank` order.

---

## 4. `state.json` v2

`state.json` stays small: it is re-injected by the SessionStart hook under a hard ~40-line
cap, so the full extraction lives in `recon.json` and state holds a digest and a pointer.

```jsonc
{
  "schema_version": 2,

  "hackathon": {
    "name": "…",
    "url": "…",
    "deadline": "2026-06-29T17:00:00-07:00",
    "next_action_deadline": { "label": "credit request form closes", "at": "2026-06-26T12:00:00-07:00" },
    "tech": { "required": ["AWS Database (Aurora | DSQL | DynamoDB)", "Vercel/v0 deploy"], "bonus": [], "forbidden": [] },
    "criteria_ids": ["technical-implementation", "design", "impact", "originality"],
    "tiebreak": "listed_order",
    "bonus_points_available": 0.6,
    "selected_track": null,
    "recon_ref": ".hackathon/recon.json"
  },

  "deliverables": {
    "submission_requirements": [{ "id": "demo-video", "status": "not_started" }],
    "bonus_content": []
  }
}
```

`:recon` seeds `deliverables.submission_requirements` from `recon.json`. `:describe` seeds
`bonus_content`. `:status` renders both. Delivery happens in M5; M2 only guarantees nothing
is forgotten.

**Migration.** `CURRENT_SCHEMA_VERSION` goes to 2 and `migrateState` gets its first real
implementation — M1 left it a stub noting "v1 is the first schema; no prior versions exist
to migrate from yet." v1→v2 is additive: insert `deliverables`, leave a null `hackathon`
alone. It must be idempotent and must still refuse a version newer than it knows.

---

## 5. `:recon <devpost-url>`

**Fetch order.** `/`, `/rules`, `/resources`, `/updates`, `/project-gallery`. WebFetch
first; the Playwright MCP on thin or JS-gated content; manual paste last.

`/updates` is new to this design — hosts post rule clarifications there, and a clarification
outranks the original text. `/project-gallery` is fetched knowing it will usually be empty;
its emptiness confirms the hackathon is pre-announcement, and when the series is recurring
the prior edition's gallery is fetched instead.

**Agent.** `hackathon-recon` (Opus; WebFetch, Playwright MCP, Read, Write) returns only
`recon.json`. Raw HTML never enters the main context.

**Validate loop.** `node scripts/recon.mjs validate .hackathon/recon.json`. On failure the
errors go back to the agent verbatim, bounded at two retries; then it stops and reports
rather than writing something malformed.

**Apply.** `node scripts/recon.mjs apply` merges the digest into `state.json`, seeds
`deliverables.submission_requirements`, and renders `brief.md`, `rules.md`, `criteria.md`.

**Ask.** Total hours available, seeding `budget`.

**Gate.** Presents the rubric with the tiebreak-first criterion marked, every `hard` and
`action` date, required technology, the panel read, and — recited explicitly, never buried —
`ambiguities` and `unresolved`.

---

## 6. `:brainstorm [--fresh] [--angle <name>]`

Four `idea-generator` agents in parallel, each with a distinct angle: `technical-wow`,
`social-impact`, `sponsor-native`, `underserved-niche`. Then one `idea-scorer` in a fresh
context, so the generator's enthusiasm cannot anchor its own evaluation.

**Evaluation order, which is the point:**

1. **Stage-One gate** — theme fit and genuine use of required technology. Failures go to
   `disqualified` with reasons and are never scored.
2. **Inversion test** (F3) — can the idea be stated as *X, not Y* in one sentence?
3. **Thesis test** (F1) — is there a one-line justification for the required technology that
   a competitor using different technology could not claim? This is also the Stage-One
   "reasonably applies the required APIs" gate restated constructively.
4. **Scoring** — per criterion, weighted, with ties resolved by the rubric's `rank`.

`ideas.md` renders the shortlist in the format already in use at
`examples/zero-hackathon/rules.md:422` — `N. Name — one-line pitch · Track · Primary
sponsor tech` — then per-idea detail, then a deep dive on the top three.

`--fresh` preserves the round as `ideas-round-N.md` and runs with no knowledge of it.

**Gate.** Select one idea, or request another round.

---

## 7. `:describe`

Writes two files. `project.md` is the stable product case; `strategy.md` is the volatile
competitive layer that later phases revise as scores and scope change.

### `project.md`

Follows the structure that won (`examples/zero-hackathon/CareCircle-Project-Description.md`):

TL;DR pitch · the problem and **why now** · the insight, framed as two extremes and an
underserved middle · personas table · features by pillar · **a day in the life with named
characters** · product principles · limitations and out-of-scope.

The named characters are marked in-file as load-bearing. Maria, Antonio, Paolo and Grace
became the seed data, the demo video script *and* the Devpost narrative — one decision,
three deliverables. Later phases must reuse the same names.

### `strategy.md`

- **Thesis** — one line, inversion form (F1, F3).
- **Criteria map** — one row per criterion, rendered from `recon.json`'s rubric so it
  cannot drift from `criteria.md`. The tiebreak-first criterion is marked.
- **Track choice** with EV reasoning, stating explicitly when crowding data is unavailable.
- **Heading plan** (F2) — at least one submission heading per criterion, with the thesis
  promoted to a top-level heading, planned against `submission_form.default_headings` so
  the insertions are visible as insertions.
- **Demo moment** and a three-minute shot skeleton.
- **Bonus-content plan** — which pieces, which angles, which platforms; seeds
  `deliverables.bonus_content`.
- **Risks and mitigations.**

**State.** Sets `project.name`, `hackathon.selected_track`, seeds `deliverables.bonus_content`.

**Gate.** Both files presented together; the thesis is read aloud, because everything
downstream depends on it.

---

## 8. Agents

| Agent | Model | Tools | Returns |
|---|---|---|---|
| `hackathon-recon` | Opus | WebFetch, Playwright MCP, Read, Write | `recon.json` only |
| `idea-generator` | Opus | Read, Write | candidate ideas for one angle; spawned ×4 |
| `idea-scorer` | Opus | Read, Write | `ideas.json` |

---

## 9. Skills

| Skill | Contents |
|---|---|
| `devpost-recon` | Page anatomy (`/`, `/rules`, `/resources`, `/updates`, `/project-gallery`, and prior editions). Sponsor and partner sections carry their own required-signal lists (F7). FAQs carry host scoring language worth quoting verbatim. Spotting rule ambiguities and the clarification remedy (F10). Separating `hard` / `action` / `informational` dates (F9). Galleries are empty until announcement. |
| `judging-criteria-scoring` | Criteria into a weighted rubric. Stage One as a separate pass/fail gate run before scoring. Tiebreak by listed order. Bonus points as score headroom — a 5.6 ceiling, not 5. Track EV from prize structure and prior editions, with honest uncertainty when crowding is unobservable. |
| `winning-ideation` | Winning angles; anti-patterns (todo apps, thin chatbot wrappers, "X but with AI"); the ≤3-minute demoability test; the quantification habit (F4); scoping to available hours. Ships `references/winner-corpus.md`. |
| `sponsor-tech-thesis` | **New skill.** The one-line "why *this* technology." The six H0 formulations, the inversion form, the placement rule (top-level heading, high in the document — F1), and the failure mode of a thesis the architecture does not actually support. Loaded at four phases: `:brainstorm` scores against it, `:describe` promotes it, `:architect` must earn it, `:submit` leads with it. That multi-phase reuse is why it is a skill and not a section. |
| `project-description` | The fourteen-section shape; the insight-as-underserved-middle framing; named characters as load-bearing; the heading-per-criterion rule (F2). |

`skills/winning-ideation/references/winner-corpus.md` distils the twelve winners to pitch,
thesis, inversion, heading structure and prize. The plugin carries its own evidence rather
than relying on model recall, and the corpus doubles as the calibration set for "is this
idea first-place shaped."

---

## 10. Knock-ons to M1

| File | Change |
|---|---|
| `scripts/lib/paths.mjs` | add `reconPath`, `ideasPath` |
| `scripts/lib/schema.mjs` | version 2; validate `deliverables` and a non-null `hackathon` |
| `scripts/lib/state.mjs` | real v1→v2 migration |
| `scripts/lib/render.mjs` | status board shows deliverables and the next action deadline |
| `hooks/inject-state.mjs` | inject `next_action_deadline`, required tech, tiebreak-first criterion; stay under the ~40-line cap |
| `scripts/lib/resolve-next.mjs` | **no change** — drift detection already walks `phase.artifacts`, so recording `recon.json` there gets drift coverage for free |

New files: `scripts/recon.mjs`, `scripts/brainstorm.mjs`, `scripts/describe.mjs`,
`scripts/lib/recon-schema.mjs`, `scripts/lib/ideas-schema.mjs`,
`scripts/lib/render-artifacts.mjs`; `commands/recon.md`, `commands/brainstorm.md`,
`commands/describe.md`; `agents/hackathon-recon.md`, `agents/idea-generator.md`,
`agents/idea-scorer.md`; five `skills/<name>/SKILL.md`.

---

## 11. Test surface

M1 established a discipline worth keeping: `tests/commands.test.mjs` holds regression tests
asserting that command prose matches what the code actually does, each with a comment
recording the drift it caught. M2 extends that rather than inventing a pattern.

**New `tests/lib/`**

- `recon-schema.test.mjs` — contiguous ranks; weight sums; **`dates[].at` rejected without an
  explicit offset**; exactly one `hard` date; hard requirements carry quotes;
  `entries_observed` null unless `gallery_available`; non-empty `unresolved` still valid.
- `ideas-schema.test.mjs` — a Stage-One failure carries no scores; `criterion_id` resolves
  against the rubric; scored ideas have `thesis`, `inversion` and `demo_moment`.
- `render-artifacts.test.mjs` — `criteria.md` marks the tiebreak-first criterion; `ideas.md`
  shortlist format; **the criteria map in `strategy.md` matches `criteria.md`**, which is the
  anti-drift property that justified rendering both from one source.

**Extended** — `schema.test.mjs` (v2 shape), `state.test.mjs` (migration is real, idempotent,
still refuses v3), `render.test.mjs`, `inject-state.test.mjs` (still under the line cap with
the new fields, still silent without `.hackathon/`), `commands.test.mjs` (the three commands
exist; `recon.md` states the retry bound and the never-guess rule; `brainstorm.md` encodes
gate-before-score; `describe.md` names both outputs).

**`tests/cli.test.mjs`** — `recon.mjs validate` exits 0 on a good fixture and non-zero with
readable errors on a bad one; `recon.mjs apply` writes four artifacts and valid v2 state.

**Fixtures.** `examples/zero-hackathon/` is a complete, real hackathon corpus whose correct
extraction and final outcome are both known, so `tests/fixtures/h0-recon.json` becomes a
golden fixture. The validator is exercised against a real Devpost hackathon with no network
call in CI, which satisfies the approved design's §14 validation requirement directly.

---

## 12. Amendments to `win-hackathon-plugin.md`

1. **§3 repo layout** — add `recon.json`, `ideas.json`, `strategy.md`.
2. **§4 state schema** — v2: `deliverables`, the `hackathon` digest, `recon_ref`.
3. **§8 `:recon`** — expanded extraction set; `/updates` and `/project-gallery` added;
   validate-retry loop.
4. **§8 `:brainstorm`** — Stage-One gate before scoring; inversion and thesis tests; `ideas.json`.
5. **§8 `:describe`** — splits into `project.md` + `strategy.md`; the fourteen-section shape;
   the heading plan.
6. **§10 skills** — `sponsor-tech-thesis` added as a twenty-third skill; the winner corpus
   reference added to `winning-ideation`.
7. **§12 cross-cutting** — a bonus-contributions subsection: tracked at recon, planned at
   describe, delivered at submit.
8. **§15 open question 1** — idea-scoring calibration is now partially answered. The
   twelve-winner corpus with known placements is the calibration set, and six of those
   winners come from a single hackathon we also entered.

---

## 13. Open questions

1. **Prior-edition detection.** Recognising that a hackathon is edition *N* of a series is
   not always possible from its pages. When detection fails, `prior_editions` is empty and
   the EV estimate says so. A heuristic on name and host may be worth adding after we have
   run this against a few real series.
2. **Devpost markup stability.** Unchanged from the parent design. The fallback chain limits
   the damage; extraction prompts will need periodic revision.
3. **Score discrimination.** The corpus tells us what winners look like, not how far apart
   the runners-up scored. Scores remain a ranking aid, not a selection oracle.
</invoke>

## Design note (2026-08-23): the Playwright MCP fallback was dropped

Earlier revisions of this document, and of `win-hackathon-plugin.md` (§302, §417, §615),
specify a Playwright MCP fallback for `:recon` when `WebFetch` returns thin or JS-gated
content, and the `recon.json` example at §137 shows `"method": "playwright"`. **That
capability was removed during M2 and is not implemented.** Those passages are kept as the
historical design record; they no longer describe the plugin.

The reason is portability, not preference. A Claude Code agent's frontmatter `tools:` list
gates what it may call, and MCP tools are named `mcp__<server>__<tool>` where the server
segment comes from each user's own MCP configuration. There is no name we can hardcode in
`agents/hackathon-recon.md` that resolves on more than the machine it was written on, so a
Playwright entry in that list is either wrong for most installs or silently unreachable —
which is what it was: the agent was instructed to use a tool its own frontmatter never
granted.

`:recon` now degrades honestly instead: on a thin or JS-gated page it records the gap in
`unresolved` and asks the user to paste the page contents. That costs one manual step on
the rare JS-gated page and never promises a capability the agent does not have.

Restoring real Playwright support needs a portable way to name MCP tools across installs.
Until that exists, do not add `mcp__*` entries to any agent's `tools:` list.
