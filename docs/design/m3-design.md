# win-hackathon M3 — Design

**Status:** approved 2026-08-23
**Covers:** phases 3–6 — `:stack`, `:architect`, `:requirements`, `:spec`
**Amends:** §8, §9, §10, §13, §14 of `win-hackathon-plugin.md`
**Predecessor:** `m2-front-half.md` (phases 0–2, shipped 2026-08-23)

---

## 1. Scope

M3 covers the four phases between a chosen project and the first line of application code.
After M3 the plugin takes a hackathon from a Devpost URL to a validated, spec'd, diagrammed
design with an agent contract — everything up to writing code.

| Phase | Command | Payload | Rendered surfaces |
|---|---|---|---|
| 3 | `:stack` | `stack.json` | `stack.md` |
| 4 | `:architect` | `architecture.json` | `docs/architecture.md`, `docs/data-model.md`, three diagram files, `AGENTS.md`, `CLAUDE.md` |
| 5 | `:requirements` | `requirements.json` | `.hackathon/requirements.md`, `features/*.feature` |
| 6 | `:spec` | *(none — reads the two above)* | `.hackathon/specs/NNNN-<slug>/{requirements,design,tasks}.md`, `openspec/changes/*` |

Three validated payloads, each with a schema module and a renderer, following the
`recon.json` / `ideas.json` pattern M2 established. `:spec` deliberately adds no payload of
its own: everything it writes is derivable from `architecture.json` and `requirements.json`,
and a fourth payload would only create a fourth thing to keep in sync.

### File layout

```
.hackathon/
  stack.json                slots, choices, rationale, repo shape
  stack.md                  rendered from stack.json
  architecture.json         components, tiers, edges, trust boundaries, entities,
                            access control, invariants, design system
  requirements.json         features, FR-IDs, acceptance scenarios
  requirements.md           rendered: FR table + acceptance criteria + test matrix
  specs/NNNN-<slug>/        rendered Kiro triad, one directory per must-have feature
    requirements.md  design.md  tasks.md

docs/                     ← showroom, judge-facing
  architecture.md           rendered: context bar, legend, flows, invariants, inline Mermaid
  data-model.md             rendered from architecture.json entities + access_control
  assets/
    architecture.mmd        Mermaid source
    architecture.svg        standalone SVG
    architecture.drawio     editable mxGraph source

AGENTS.md                   rendered: drift banner block + numbered invariants
CLAUDE.md                   single line: @AGENTS.md
features/<slug>.feature     rendered Gherkin, one file per feature
openspec/changes/<slug>/    owned by the @fission-ai/openspec CLI
```

Two placement calls, both consistent with §3 of the approved design:

**`data-model.md` is judge-facing.** It goes to `docs/`, not `.hackathon/`. Kintwadi's and
Sonar's data-model docs are both in the showroom, and Kintwadi's is the single strongest
artifact behind its Technical Implementation case.

**The Kiro specs stay in the workshop.** `.hackathon/specs/`, not `docs/specs/` — they are
working documents that M4 consumes, and Relay kept its equivalents in `.kiro/`, out of the
judge's path.

### Dependency chain

Strictly forward. No phase writes into an earlier phase's payload, which is what makes
re-entry safe:

```
recon.json ─┐
project.md ─┼─► stack.json ─► architecture.json ─┬─► requirements.json ─► specs/ + features/
strategy.md ┘                                    └─► docs/, AGENTS.md, diagrams
```

Rerunning `:architect` to revise a component cannot corrupt `stack.json`, and rerunning
`:stack` leaves `requirements.json` intact but marks the downstream phases for review through
the existing drift check.

---

## 2. Evidence base

M2's design improved sharply once it was grounded in twelve winning submissions rather than
recall. M3 asks a different question — *what does a winning repository look like at design
time* — so it needed a different corpus: the repositories themselves.

**Ten repositories read.** Eight of the twelve corpus projects published one; CrisisRoute and
Title AI shipped a live demo with no public repository. Kintwadi and Karma were read from
local working copies.

| Project | Prize | Agent contract | Architecture doc | Diagram | Specs |
|---|---|---|---|---|---|
| Kintwadi | Best Design | `AGENTS.md`: drift banner + 6 numbered security invariants; `CLAUDE.md` = `@AGENTS.md` | `docs/architecture.md` + `docs/data-model.md` | `.drawio` + inline Mermaid + hand-exported `.png` | — |
| Sonar | 1st, Million-scale Global | `AGENTS.md`: drift banner only | `docs/data-model.md`, `docs/architecture/` | inline SVG authored by `generate_pdf.py` → PDF | `docs/superpowers/specs/*-design.md` |
| Relay | Most Impactful | `CLAUDE.md` operating manual with dated staleness banners | `docs/standby-architecture.md` | `.svg` + `.png` | `.kiro/specs/relay-h0-mvp/{requirements,design,tasks}.md` |
| HYPE | Best Technical Implementation | none | `docs/architecture.md`, with an `## Invariants` section | `.svg` | — |
| Cassandra | 1st, Arize | `CLAUDE.md` | `ARCHITECTURE.md` + `SYSTEM_DESIGN.md` | — | `REQUIREMENTS.md`: FR-IDs + acceptance criteria + test matrix |
| Project Memoria | Best Multimodal Understanding | `AGENTS.md` as a repository operating manual | `TECHNICAL_DESIGN.md` | — | `docs/specs/NNNN-feature/{requirements,design,tasks,status}.md` |
| Karma | 2nd, Dynatrace | none | `docs/ARCHITECTURE.md`, security as a section | ASCII box art | — |
| Sammy | 1st, Monetizable B2B | none | none | — | — |
| BackstageCommercials | First Prize Overall | none | none | — | — |
| Waylo | 1st, Monetizable B2C | *(org-level repo; not read)* | — | — | — |

### Findings that drive this design

**1. The framework-drift banner has a canonical form already in the wild.** Kintwadi's and
Sonar's `AGENTS.md` open with a byte-identical marked block:

```
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

Two unrelated teams, both winners, same text and same marker convention — the same
`<!-- BEGIN:… -->` convention `:init` already uses. `framework-drift-guard` ships this
verbatim rather than generating an approximation of it. The provenance is a shared public
snippet, not one team copying the other; the point is that the form is settled, not that
either team invented it.

**2. Nobody used Gherkin. Nobody used OpenSpec.** The two winners that practised spec-driven
development both used the Kiro triad — `requirements.md` / `design.md` / `tasks.md` per
feature — and Cassandra used numbered FR-IDs with a testable acceptance-criteria section and
a test matrix. Sonar used superpowers' own `*-design.md`. This contradicted the approved §8.

*Decision (Roger, 2026-08-23):* build all three — the Kiro triad, Gherkin, and OpenSpec — but
render every one of them from a single `requirements.json` so they cannot disagree. Each
surface is retained only because it has a distinct reader (§6.3); any that turns out to have
no reader in M4 should be dropped then rather than maintained out of habit.

**3. Mermaid and SVG carry the diagrams; `.drawio` is Kintwadi-only.** Across the corpus:
Kintwadi shipped `.drawio` plus inline Mermaid plus a PNG exported by hand through
app.diagrams.net; Sonar hand-authored inline SVG in a Python script rendered to PDF; HYPE and
Relay shipped `.svg`; Karma shipped ASCII box art. **No project automated a `.drawio` → PNG
export.**

*Decision (Roger, 2026-08-23):* emit all three — Mermaid, SVG and drawio — but derive them
from one laid-out graph (§4), so three formats are three views of one source rather than
three documents to maintain.

**4. `AGENTS.md` has four honest shapes, and a short one is not a failure.** Kintwadi's
numbered security-invariants contract, Sonar's banner alone, Memoria's repository operating
manual, HYPE's judge-facing `## Invariants` section inside the architecture doc. Sonar won
first place with an `AGENTS.md` five lines long.

*Decision (Roger, 2026-08-23):* `security-invariants` generates Kintwadi's shape, scaled to
the project. A project with no tenancy story gets fewer, honest invariants — never invented
ones.

**5. The design system that won Best Design was fixed before the first screen existed.**
`examples/zero-hackathon/prompts/01-design-system.md` establishes semantic colour tokens for
light and dark, an explicit **ANTI-GENERIC** list ("no purple/indigo gradients, no neon, no
glassmorphism everywhere, no emoji as UI icons, avoid pure #000 on #FFF"), Inter for UI with
Fraunces for marketing display only, and a 16px floor for older-adult readability — then all
sixteen screen prompts reuse it. That is why the result reads as one product.

*Decision (Roger, 2026-08-23):* `architecture.json` carries a `design_system` block, so M4
builds every screen against one system instead of inventing a palette per component.

**6. Kintwadi's `architecture.md` and `data-model.md` are reusable templates.** They are the
same documents as `CareCircle-Architecture.md` and `CareCircle-Data-Model.md`, renamed after
the project was named — written at design time, before implementation, which is exactly
`:architect`'s position in the pipeline. Their section structures are adopted directly (§7).

### What the corpus cannot say

Nine of the twelve corpus projects are not Roger's and their repositories were read from the
outside; commit history was not analysed, so nothing here claims *when* in the timeline an
artifact was written except where a document says so itself. Two projects published no
repository at all, and Waylo's link resolves to an organisation rather than a repository, so
the diagram and agent-contract counts above are out of ten, not twelve. **Corpus rows are
evidence and are never edited to fit a claim.**

---

## 3. The contracts

Three payloads. Each gets a schema module beside `recon-schema.mjs` and `ideas-schema.mjs`,
exporting `X_SCHEMA_VERSION` and `validateX(doc, upstream) → { valid, errors, warnings }`,
with path-prefixed messages (`features[2].scenarios[0].requirement_ref`). Cross-payload checks
degrade to a warning when the upstream payload is absent and harden to an error when it is
present and violated — the rule `validateIdeas` already follows for `recon`.

### 3.1 `.hackathon/stack.json`

Every slot records what filled it and why it could not have been otherwise. `source` is the
sponsor-wins precedence made mechanical.

```jsonc
{
  "schema_version": 1,
  "repo_shape": "next-monolith",              // | "multi-service"
  "shape_rationale": "Server actions cover every write; no second deployable earns its keep.",

  "slots": [
    {
      "id": "database",
      "choice": "Amazon Aurora DSQL",
      "source": "required",                    // required | default | bonus | replacement
      "requirement_ref": "aws-database",       // → requirementKey(recon.tech.required[i]); required only
      "rationale": "Multi-region active-active is the availability claim the thesis rests on.",
      "thesis_support": "carries"              // carries | supports | neutral
    },
    {
      "id": "frontend",
      "choice": "Next.js 16 + TypeScript + Tailwind + shadcn/ui",
      "source": "default",
      "rationale": "Personal default; fills an open slot the rules leave unspecified.",
      "thesis_support": "neutral"
    }
  ],

  "bleeding_edge": [
    { "slot": "frontend", "package": "next", "pin": "16.x",
      "docs_path": "node_modules/next/dist/docs/" }
  ],

  "rejected": [
    { "slot": "database", "choice": "DynamoDB",
      "why_not": "The access pattern is relational and transactional; single-table would fight it." }
  ]
}
```

#### Validation rules

| Rule | Severity | Why |
|---|---|---|
| Every `recon.tech.required[]` id is covered by a slot with `source: "required"` | **error** | An uncovered mandate is a Stage One pass/fail failure, not a style question |
| No slot `choice` matches anything in `recon.tech.forbidden[]` | **error** | Same reason |
| At least one slot has `thesis_support: "carries"` | **error** | If nothing carries the thesis, `strategy.md`'s win argument has no architecture behind it |
| `repo_shape` is one of the two known shapes | error | `monorepo-structure` only has playbooks for two |
| Every slot has a non-empty `rationale` | error | A slot with no reason is an undocumented default |
| `source: "required"` slot has a `requirement_ref` | error | Traceability into `recon.json` |
| Every `requirement_ref` resolves to an uncovered `recon.tech.required[]` entry, and if that entry carries `one_of`, the slot's `choice` matches one of those options | error | A declared `requirement_ref` that does not resolve, or resolves to a choice outside the sponsor's allowed set, is decorative traceability |
| `bleeding_edge[]` entry has a `docs_path` | warning | The drift banner needs somewhere to point |
| `recon.json` absent | warning | Required/forbidden checks skipped; state the reason plainly |

`recon.tech.required[]`/`forbidden[]` entries carry a human `name` (e.g. `"AWS Database"`),
not a stable `id` — recon extraction never mints one. `requirement_ref` needs something
short and stable to point at, so `stack-schema.mjs` derives it deterministically:
`requirementKey(entry)` returns an explicit `entry.id` when present, otherwise a lowercase,
hyphenated slug of `entry.name` (non-alphanumeric runs collapse to one `-`, trimmed at both
ends). A `required` entry may also carry `one_of: string[]` — the sponsor's allowed choices
for that mandate (e.g. multiple acceptable databases). When present, the covering slot's
`choice` must case-insensitively contain at least one of those options, or validation fails
even though the `requirement_ref` resolves: naming the mandate is not the same as satisfying
it.

The thesis check is the one that earns the most. Roger's `sponsor-tech-thesis` skill teaches
that the failure mode is "a thesis the architecture does not actually support"; this makes
that failure mechanical instead of a matter of taste.

### 3.2 `.hackathon/architecture.json`

One graph, six consumers.

```jsonc
{
  "schema_version": 1,
  "thesis_line": "The database is the thesis, not a default.",
  "context_bar": {
    "track": "Monetizable B2C",
    "primary_database": "Amazon Aurora PostgreSQL (Serverless v2 — RLS · pgvector)",
    "ai": "Amazon Bedrock — Claude Sonnet 4.5 + Titan embeddings",
    "frontend": "Next.js on Vercel"
  },

  "components": [
    {
      "id": "web", "label": "Next.js on Vercel", "tier": 1, "kind": "frontend",
      "what_it_is": "The single deployable surface.",
      "what_it_does": "Serves marketing and the authenticated app; server actions do the writes.",
      "why_this_choice": "One deployable removes a network hop from every mutation.",
      "stack_slot": "frontend",
      "trust_zone": "public"                  // public | authenticated | privileged | external
    }
  ],

  "edges": [
    { "from": "web", "to": "db", "label": "RLS-scoped transaction", "crosses_boundary": true }
  ],

  "trust_boundaries": [
    { "id": "aws", "label": "AWS account boundary", "contains": ["db", "s3", "bedrock"] }
  ],

  "flows": [
    { "id": "ask", "title": "Ask — the RAG pipeline", "steps": ["…", "…"] }
  ],

  "entities": [
    {
      "name": "care_circle", "group": "identity-and-tenancy",
      "purpose": "The tenant. Everything else hangs off it.",
      "tenant_scoped": false,
      "fields": [{ "name": "id", "type": "uuid", "note": "primary key" }],
      "relationships": [{ "to": "membership", "kind": "one-to-many" }]
    }
  ],

  "access_control": {
    "model": "rls",                            // rls | app-layer | none
    "session_context": "app.current_user_id",
    "capability_matrix": [
      { "role": "owner", "can": ["read:all", "write:all", "invite"] }
    ],
    "policies": [
      { "id": "tenant-isolation", "applies_to": ["care_circle", "membership"],
        "rule": "row visible only when the circle is in the caller's membership set" }
    ]
  },

  "invariants": [
    { "id": "protected-by-default",
      "statement": "Every authenticated page lives under the (app) route group, whose layout runs requireSession().",
      "enforced_by": "src/app/(app)/layout.tsx" }
  ],

  "design_system": {
    "personality": "Calm, warm, human, dignified. Quiet confidence.",
    "anti_generic": ["no purple/indigo gradients", "no neon", "no glassmorphism everywhere",
                     "no emoji as UI icons", "avoid pure #000 on #FFF"],
    "tokens": {
      "light": { "background": "#FBFAF8", "primary": "#0F766E", "accent": "#EC7C5A" },
      "dark":  { "background": "#101512", "primary": "#14B8A6", "accent": "#F0916F" }
    },
    "type": { "ui": "Inter", "display": "Fraunces", "base_px": 16, "min_meaningful_px": 14 },
    "breakpoints_px": [375, 820, 1024, 1440]
  }
}
```

`tier` is an integer and it is what makes deterministic layout possible: tier 1 is the top
row, tier *n* sits below it, edges flow downward, components within a tier space evenly across
the canvas. That is the layout Kintwadi's `.drawio` has by hand, so generated output lands in
the same visual family rather than looking like a graph library's output.

#### The six consumers

| Consumer | Reads |
|---|---|
| `docs/architecture.md` | `context_bar`, `thesis_line`, `components`, `flows`, `invariants`, `design_system`, plus the Mermaid diagram |
| `docs/data-model.md` | `entities`, `access_control` |
| `docs/assets/architecture.{mmd,svg,drawio}` | `components`, `edges`, `trust_boundaries` |
| `AGENTS.md` | `invariants` (statement + `enforced_by`), `bleeding_edge` from `stack.json` |
| M4 `:build` | `design_system`, `components`, `invariants` |
| M4 `compliance-checker` | `components[].stack_slot`, `invariants` |

#### Validation rules

| Rule | Severity |
|---|---|
| Every `edges[].from` / `.to` resolves to a component id | **error** |
| Every `trust_boundaries[].contains[]` entry resolves to a component id | **error** |
| `tier` is a positive integer, and tiers form a gapless sequence from 1 | **error** |
| Every `invariants[].enforced_by` is a non-empty path or symbol | **error** — an invariant nobody enforces is a wish |
| `access_control.model == "rls"` ⟹ every `tenant_scoped` entity is named by at least one policy | **error** — this is the check that catches a new table shipped without a policy |
| Every `components[].stack_slot` exists in `stack.json` | error when `stack.json` present, warning when absent |
| Component ids and entity names are unique | error |
| `design_system.tokens` defines both `light` and `dark` | warning |
| At least one component's `stack_slot` names a slot whose `thesis_support` is `"carries"` | warning — the thesis has a technology behind it but no component realising it |

### 3.3 `.hackathon/requirements.json`

Scenarios are structured rather than prose, which is what lets Gherkin render mechanically
instead of being written twice.

```jsonc
{
  "schema_version": 1,
  "features": [
    {
      "id": "F1", "slug": "shared-care-record", "title": "One shared care record",
      "priority": "must",                         // must | should | wont
      "criterion_refs": ["technical-implementation", "design"],
      "component_refs": ["web", "db"],
      "user_story": {
        "as_a": "an adult child coordinating care from another city",
        "i_want": "one record every family member and caregiver sees",
        "so_that": "nobody acts on a stale copy"
      },
      "requirements": [
        { "id": "FR-1.1",
          "statement": "A member sees only circles they belong to.",
          "invariant_refs": ["tenant-isolation"] }
      ],
      "scenarios": [
        { "id": "FR-1.1-S1", "name": "A non-member cannot read the record",
          "requirement_ref": "FR-1.1",
          "given": ["a circle owned by another family"],
          "when": ["I request that circle's timeline"],
          "then": ["the response is empty", "an audit row records the attempt"],
          "tags": ["@must", "@security"] }
      ],
      "demo_moment": true
    }
  ],
  "non_functional": [
    { "id": "NFR-1", "statement": "First contentful paint under 2s on the demo path.",
      "verify": "Lighthouse run recorded in the runbook" }
  ]
}
```

#### Validation rules

| Rule | Severity |
|---|---|
| Every criterion in `recon.json`'s rubric is claimed by at least one `must` feature | **error** — a judging criterion with nothing built against it scores zero on a weighted axis |
| A criterion claimed only by `should` / `wont` features | warning |
| Every `criterion_refs[]` entry exists in the rubric | **error** when recon present |
| Every `must` feature has at least one scenario | **error** — the approved §8 rule |
| `requirements[].id` unique and matching `^FR-\d+\.\d+$` | error |
| `scenarios[].requirement_ref` resolves within its own feature | error |
| `component_refs[]` resolve into `architecture.json` | error when present, warning when absent |
| `invariant_refs[]` resolve into `architecture.json.invariants` | error when present, warning when absent |
| Each scenario has non-empty `given`, `when` and `then` arrays | error |
| At least one feature has `demo_moment: true` | warning, cross-checked against `strategy.md` |
| Feature `slug` unique and filesystem-safe | error — it becomes a filename in three places |

---

## 4. The diagram pipeline

Three formats, one source. `architecture.json` holds a tiered graph; a layout pass turns it
into positioned boxes and routed edges; three emitters render that laid-out graph.

```
architecture.json ──► layout.mjs ──► { boxes: [{id,x,y,w,h,label,zone}],
      (tiers, edges)                   edges: [{from,to,points,label}],
                                       boundaries: [{x,y,w,h,label}] }
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
              emit-mermaid.mjs          emit-svg.mjs          emit-drawio.mjs
              architecture.mmd          architecture.svg      architecture.drawio
              (also inlined into        (embeddable in        (editable in
               docs/architecture.md)     the README)           app.diagrams.net)
```

### Layout

Deliberately simple, because the corpus diagrams are simple: tiers are rows, components are
evenly spaced within a row, edges run downward between tier bands, and a `trust_boundary`
becomes a dashed rectangle enclosing the bounding box of its members. Constant box size with
label wrapping at a fixed character count. No force-directed layout, no crossing minimisation
— Kintwadi's hand-drawn `.drawio` has neither, and adding them would buy visual polish at the
cost of a component nobody can test.

`layout.mjs` is pure: payload in, geometry out, no filesystem access. That is what makes the
emitters testable without writing files.

### Emitters

**Mermaid.** `flowchart TB`, one `subgraph` per trust boundary, `classDef` per `trust_zone`
so zones are colour-coded the way Kintwadi's classDefs are. Mermaid does its own layout, so
this emitter uses tiers for node *ordering* and ignores the coordinates. It is the diagram
that always renders — GitHub, every Markdown preview, and the artifact pipeline.

**SVG.** Positioned rectangles, labels, arrowheads and dashed boundary rects, written directly
from the geometry. Self-contained, no external fonts, theme-neutral. This is the file the
README embeds and the one anyone can convert to PNG with any tool.

**drawio.** mxGraph XML — `<mxfile><diagram><mxGraphModel><root>` with one `<mxCell vertex>`
per box carrying an `mxGeometry`, one `<mxCell edge>` per edge, and boundary groups as
container cells. Kintwadi's `.drawio` is a 20 KB hand-authored file of exactly this shape, so
the format is proven writable by hand; generating it is bounded work.

**No PNG.** Nothing in the corpus automated a PNG export, and doing it would mean a headless
renderer — a runtime dependency the plugin does not have and does not want. `docs/architecture.md`
carries the export steps as Kintwadi's does, and the SVG covers every case a PNG would.

### What the tests assert

Because this is code rather than prose, the assertions are real:

- every component in the payload appears in all three renderings, matched by id
- edge count in each rendering equals `edges.length`
- no two boxes overlap, and every box lies inside the canvas
- tier order is preserved top to bottom in the SVG and drawio geometry
- every trust boundary rect encloses all of its members' boxes
- the emitted drawio parses as XML and its root has the expected mxGraph shape
- the Mermaid emitter escapes labels containing quotes, brackets and pipes
- a payload with one component and no edges renders in all three formats without error

---

## 5. `state.json` v3

Three additive changes. Migration is idempotent, refuses a version it does not know, and
follows the v1→v2 implementation `migrateState` already carries.

```jsonc
{
  "schema_version": 3,

  "project": {
    "name": "…",
    "selected_idea": "…",
    "stack": {
      "repo_shape": "next-monolith",
      "primary_database": "Amazon Aurora DSQL",
      "ref": ".hackathon/stack.json"
    },
    "architecture_ref": ".hackathon/architecture.json",
    "requirements_ref": ".hackathon/requirements.json"
  },

  "compliance": {
    "last_checked": "2026-08-23T18:04:00Z",
    "required_tech_verified": { "aws-database": true, "vercel-deploy": false }
  }
}
```

**`project` gains validation.** It has none today — `schema.mjs` defaults it to `null` and
never checks its shape. M4's `compliance-checker` will read `project.stack`, and an
unvalidated field that a later phase depends on is how the M2 skipped-counted-as-done bug
shipped. v3 validates `project` when it is non-null: `name` and `selected_idea` non-empty
strings, `stack` either absent or an object with a known `repo_shape`, and the three `*_ref`
fields either absent or paths that exist.

**`:stack` seeds `compliance.required_tech_verified`** with one `false` entry per
`source: "required"` slot. `:ship` and `:check` flip them in M4. The field already exists in
v2; M3 is the first phase to populate it.

**The four new phases declare their `artifacts` arrays**, so the resolver's existing drift
check covers them with no new resolver code — approve `:architect`, delete
`docs/architecture.md`, and `:next` reports drift.

| Phase | `artifacts` |
|---|---|
| `stack` | `.hackathon/stack.json`, `.hackathon/stack.md` |
| `architect` | `.hackathon/architecture.json`, `docs/architecture.md`, `docs/data-model.md`, `docs/assets/architecture.mmd`, `docs/assets/architecture.svg`, `docs/assets/architecture.drawio`, `AGENTS.md`, `CLAUDE.md` |
| `requirements` | `.hackathon/requirements.json`, `.hackathon/requirements.md` |
| `spec` | `.hackathon/specs` |

`features/` and `openspec/` are deliberately absent from the `spec` artifacts list: the
Gherkin file set varies with the feature list, and `openspec/` may legitimately be missing
when the CLI was unreachable (§6.4). Listing them would make drift fire on a state that is
correct.

---

## 6. The commands

All four follow the protocol M1 and M2 established: read upstream state, do the work, validate
the payload, render, set the phase to `awaiting_approval`, stop. Nothing advances without an
explicit approval. All writes are non-destructive — every pre-existing artifact is backed up
into `.hackathon/backups/<timestamp>/` before it is overwritten, and `--dry-run` prints the
plan without touching disk. There is no `--force`.

The CLIs themselves are non-interactive — an agent invokes them, not a human, so a prompt at
that layer has nobody to answer it. The per-file overwrite consent §7's "Non-destructive
guarantees" describes for `win-hackathon-plugin.md` therefore lives one layer up, in the
command file: dry-run first, show the user what would be overwritten, then apply only once
they have seen that list. Every command file follows this shape.

A phase that cannot produce a valid payload stays `in_progress` with a `resume_note` rather
than writing a half-artifact. Validation is the gate.

### 6.1 `:stack`

Reads `recon.json` (required and forbidden tech, criteria), `project.md` and `strategy.md`
(the thesis and the track). Loads `monorepo-structure`, `sponsor-tech-thesis` and
`framework-drift-guard`.

Resolves each slot under sponsor-wins precedence — required tech is fixed and cannot be traded
away; personal defaults fill open slots; bonus tech is adopted only when its cost is
proportionate to its scoring value — then selects the repository shape, writes `stack.json`,
renders `stack.md`, and seeds `compliance.required_tech_verified`.

`stack.md` renders: the shape and its rationale; a slot table with choice, source, rationale
and thesis support; the bleeding-edge pins with their docs paths; and the rejected
alternatives with why not. The rejected table is not decoration — `:submit` draws on it for
the "why this stack" argument, and a rejected option with a good reason is evidence of a
deliberate architectural choice, which is what the Technical Implementation criterion asks
for in as many words.

Runs in the main context. No subagent: the reasoning is short and the output is a table you
read at the gate anyway.

### 6.2 `:architect`

Dispatches `solution-architect` (§7). The agent's sole output is `architecture.json`;
everything else is rendered from it by code.

Rendered surfaces:

**`docs/architecture.md`** — Kintwadi's proven structure: title; a one-line context bar
(track · primary database · AI · frontend); the thesis note; a pointer to the three diagram
sources; the inline Mermaid diagram; **the component legend in the *what it is* / *what it
does* / *why this choice* form** — that third column is the design-scoring device, because it
turns a parts list into a record of decisions; the key request flows; the marquee pipeline in
detail; the system in one paragraph; the design system; and the diagram export steps.

**`docs/data-model.md`** — Kintwadi's twelve-section shape: why this model; design principles
applied to every table; the ERD; the entity catalog grouped by `entities[].group`; the design
call-out; transactions and integrity; the RBAC capability matrix; access control in one
sentence; the policy design in detail; indexing and performance; **why this database over the
alternative *for this model***; and scope and forward-compatibility. Sections whose payload
fields are empty are omitted rather than emitted with placeholder text.

**`AGENTS.md`** — via `security-invariants`. The `framework-drift-guard` marked block first,
then the numbered invariants from `architecture.json.invariants`, each carrying its
`enforced_by` anchor, closing the numbered list with *"If a change would bypass any of the
above, stop and flag it instead of shipping it."* Written through the existing marked-block
machinery, so a rerun updates the plugin's block and leaves hand-added sections alone.
`CLAUDE.md` becomes the single line `@AGENTS.md` — created if absent, and if it already has
content, the `@AGENTS.md` line is added rather than the file replaced.

A project with no tenancy or auth story gets a short `AGENTS.md`. Sonar won first place with
five lines. The skill must not invent invariants to pad it.

### 6.3 `:requirements`

Reads `architecture.json`, `strategy.md` and `recon.json`. Loads `gherkin-requirements`.
Turns the feature set into `requirements.json`, then renders two surfaces.

**`.hackathon/requirements.md`** — Cassandra's shape: component inventory, functional
requirements grouped by feature with FR-IDs, non-functional requirements, acceptance criteria
as a testable Definition of Done, and a test matrix.

**`features/<slug>.feature`** — Gherkin, one file per feature. `user_story` becomes the
feature description block, each scenario becomes a `Scenario:` with its Given/When/Then lines
(repeated entries rendered as `And`), and `tags` are emitted verbatim above the scenario.

### 6.4 `:spec`

Reads both payloads. Loads `openspec-workflow`. Writes two more surfaces from the same source.

**`.hackathon/specs/NNNN-<slug>/`** — the Kiro triad, one directory per `must` feature,
numbered in dependency order:

- `requirements.md` — the user story and the feature's FRs as numbered acceptance criteria in
  EARS form (*Easy Approach to Requirements Syntax* — "WHEN &lt;trigger&gt;, THE SYSTEM SHALL
  &lt;response&gt;"), rendered from its scenarios: `when` supplies the trigger, `then` the
  response, and `given` becomes a WHILE precondition clause
- `design.md` — **the slice of the architecture this feature lives in**: the components named
  by `component_refs`, the entities they touch, the invariants named by `invariant_refs`, and
  any flow the feature participates in. This slice is what makes the triad worth generating
  rather than typing: each spec folder arrives carrying exactly the context M4's
  implementation agent needs and nothing else.
- `tasks.md` — a numbered checklist, each task citing the FR ids it satisfies

**`openspec/changes/<slug>/`** — one proposal per `must` feature, seeded from the same payload,
then validated. `:spec` verifies `@fission-ai/openspec` resolves, runs `openspec init` when
`openspec/` is absent, writes the proposals, and runs `openspec validate`.

*The package is `@fission-ai/openspec`. The bare `openspec` name on npm is an unrelated
squatted `0.0.0` stub.*

**When the CLI is unreachable** — offline, registry failure, install refused — the other three
surfaces still render and the phase reports OpenSpec as **deferred**, naming the command to
run later. A phase whose other outputs are complete does not fail on an optional external
tool. `:next` treats a deferred OpenSpec as a note, not a blocker.

#### Why four surfaces

The FR table, the Gherkin and the Kiro `requirements.md` restate the same acceptance criteria
three ways. Rendering all of them from one payload means they cannot disagree; each is kept
because it has a distinct reader:

| Surface | Reader |
|---|---|
| `requirements.md` | you, at the approval gate |
| `features/*.feature` | the M4 acceptance-test run |
| `specs/NNNN-*/` | superpowers SDD in M4 |
| `openspec/changes/*` | the OpenSpec CLI and its validator |

If any of these turns out to have no reader once M4 is built, it should be dropped then rather
than maintained out of habit.

---

## 7. The agent

One new agent. `agents/solution-architect.md`.

| Field | Value |
|---|---|
| Model | Opus |
| Tools | Read, Write, Bash, WebFetch |
| Dispatched by | `:architect` only |
| Returns | `architecture.json`, and nothing else |

It exists because deep design exploration — reading `stack.json`, `project.md`, `strategy.md`
and `recon.json`, fetching sponsor documentation, and working out components, entities and
policies — would otherwise fill the main context with material nobody needs after the payload
exists.

**No second critic agent.** The schema validator and the approval gate are the checks. M2
showed that a reviewer agent whose findings nothing validates is another context to babysit,
and the validation rules in §3.2 catch the failures a critic would be asked to look for:
dangling edges, unenforced invariants, tenant-scoped entities with no policy.

`:stack`, `:requirements` and `:spec` run in the main context. Their reasoning is short, their
output is a table or a file set you read at the gate, and a subagent would add a handoff
without removing any context pressure.

---

## 8. The skills

Ten skills. `skills/<name>/SKILL.md`, following the M2 pattern: the skill body is the know-how,
and anything that is *evidence* goes in `references/` so a claim can be checked against a
source rather than trusted.

| Skill | Loaded at | Evidence it ships |
|---|---|---|
| **`security-invariants`** | `:architect` | `references/invariants-corpus.md` — Kintwadi's six numbered invariants with their `enforced_by` anchors; Sonar's banner-only file; HYPE's judge-facing `## Invariants`; Karma's security-as-a-section. Four shapes, and when each is honest |
| **`framework-drift-guard`** | `:stack`, `:architect` | The canonical marked block verbatim, with the finding that Kintwadi and Sonar shipped it byte-identical |
| **`monorepo-structure`** | `:stack` | Both shapes as measured: `next-monolith` (Kintwadi — `src/app/(app)` route group, `src/db/dal.ts`, `infra/` Terraform, two workflows) and `multi-service` (Karma — `web/` + `api/` + `agents/`, per-service Dockerfile and `pyproject.toml`, four path-filtered deploy workflows plus one release-triggered (`publish-packages.yml`), `setup-wif.ps1`) |
| **`frontend-architecture`** | `:architect` | Kintwadi's protected-by-default route group, the `proxy.ts` fail-closed edge allowlist, DAL layering |
| **`backend-architecture`** | `:architect` | Karma's FastAPI gateway / agent-service split, Secret Manager over environment variables, separated token scopes |
| **`data-modeling`** | `:architect` | Kintwadi's `data-model.md` twelve-section template, including the RLS policy taxonomy and the "why this database *for this model*" section |
| **`architecture-diagramming`** | `:architect` | All five corpus diagram approaches, and the tier-layout rules the emitters implement |
| **`ui-design-principles`** | `:architect` | `01-design-system.md` distilled: semantic tokens over raw hex, the ANTI-GENERIC list, breakpoints 375/820/1024/1440, WCAG AA, `prefers-reduced-motion`, a 16px floor for meaningful text, no lorem |
| `gherkin-requirements` | `:requirements` | **None from the corpus.** Ships as craft, and says so in its own text |
| `openspec-workflow` | `:spec` | **None from the corpus.** Ships the CLI mechanics and the `@fission-ai/openspec` name trap |

The last two are marked unevidenced inside the skills themselves. A skill that implies corpus
backing it does not have is the same failure that shipped an invented claim about Kintwadi in
M2, and the fix is to say so in the text rather than to leave the reader to infer it.

`ui-design-principles` is loaded at `:architect` rather than at `:build` because its output is
the `design_system` block — a decision recorded once, before any screen exists, which is how
Kintwadi's sixteen screens came out looking like one product.

---

## 9. Knock-ons to M1 and M2

| Change | Where | Why |
|---|---|---|
| `CURRENT_SCHEMA_VERSION` → 3; `migrateState` gains v2→v3 | `scripts/lib/schema.mjs`, `state.mjs` | §5 |
| `project` validated when non-null | `scripts/lib/schema.mjs` | It is unvalidated today and M4 depends on it |
| Four new phase `artifacts` arrays | wherever phases are marked approved | Enables the existing drift check |
| New path helpers: `stackPath`, `architecturePath`, `requirementsPath`, `specsDir` | `scripts/lib/paths.mjs` | Matches `reconPath` / `ideasPath` |
| `render.mjs` gains table and definition-list helpers | `scripts/lib/render.mjs` | Three new renderers need them; M2's helpers cover headings and lists only |
| Four new command files, four new CLI entry points | `commands/`, `scripts/` | `:stack`, `:architect`, `:requirements`, `:spec` |
| `:status` renders stack and architecture summaries | `scripts/status.mjs` | It already renders recon and ideas digests |
| Marketplace manifest lists the new commands, agent and skills | `.claude-plugin/plugin.json` | `manifest.test.mjs` asserts the manifest matches the tree |

No change to `resolve-next.mjs`. The resolver is a resolver over on-disk state; four more
phases with declared artifacts need no new logic, which is the payoff of the M1 design.

---

## 10. Test surface

M2's lesson, applied deliberately: **tests that grep prose are usually unfalsifiable.**
Reversing the body lines of all fifteen M2 skill, agent and command files still left 53 of 55
prose tests passing, and three real bugs shipped against a fully green suite.

Most of M3 is code rather than prose, which is the best available defence.

**Genuinely mechanical, tested normally:**

- `stack-schema.mjs`, `architecture-schema.mjs`, `requirements-schema.mjs` — each rule in §3
  gets a case that passes and a case that fails, plus the upstream-absent degradation path
- `layout.mjs` — geometry only: tier ordering, non-overlap, boundary enclosure, single-node
  and no-edge degenerate cases
- the three emitters — the assertions listed in §4
- the four `:spec` surfaces — one `requirements.json` in, four renderings out, every FR id
  present in each, EARS rendering correct, Gherkin `And` handling for multi-line steps
- rubric coverage — a payload with an uncovered criterion must fail
- `:stack` seeding `compliance.required_tech_verified` from required slots
- v2→v3 migration — additive, idempotent, still refusing a newer version
- non-destructive writes — backup created, `--dry-run` writes nothing, marked-block rerun
  updates only the plugin's block, existing `CLAUDE.md` content preserved
- the OpenSpec-unreachable path — three surfaces still written, phase reports deferred

**Prose, tested under the M2 rules:**

- assertions scoped to their section with `content.slice(indexOf(…), indexOf(…))`, asserting
  **position**, not keyword presence
- **every prose test proved by mutating the file until it fails.** A test not shown failing is
  not a test
- `\b` on every short pattern — `/tie/i` matches "properties" and `/EV/i` matches "eleven"
- any claim a skill makes about a real project is checked against `references/`, and the
  corpus tables are never edited to fit a claim

---

## 11. Amendments to `win-hackathon-plugin.md`

| Section | Amendment |
|---|---|
| §4 State schema | v2 → v3; `project` validated; `project.stack`, `architecture_ref`, `requirements_ref` added |
| §8 `:stack` | Emits a validated `stack.json`; `stack.md` renders from it. Seeds `compliance.required_tech_verified` |
| §8 `:architect` | Emits `architecture.json`; all other surfaces render from it. Three diagram formats — Mermaid, SVG, drawio — from one laid-out graph; **no automated PNG**. Adds the `design_system` block |
| §8 `:requirements` | Emits a validated `requirements.json`; FR-IDs with acceptance criteria and a test matrix alongside Gherkin |
| §8 `:spec` | Adds the Kiro triad in `.hackathon/specs/NNNN-<slug>/` beside the OpenSpec proposals. OpenSpec unreachable is deferred, not fatal |
| §9 Agents | `solution-architect` returns `architecture.json` only |
| §10 Skills | `ui-design-principles` loads at `:architect` and produces `design_system`; `gherkin-requirements` and `openspec-workflow` are marked unevidenced |
| §13 Plugin layout | Four commands, one agent, ten skills, and the new `scripts/lib` modules |
| §14 Staging | M3 delivers in two stages; both land before M3 is done |

---

## 12. Delivery

One spec, all four commands, everything ships. Two implementation stages, so review stays
honest — the split is a review boundary, not a scope cut.

**Stage 1 — `:stack` and `:architect`.** State v3 and its migration; `stack.json` and
`architecture.json` contracts and validators; `layout.mjs` and the three emitters;
`architecture.md`, `data-model.md`, `AGENTS.md` and `CLAUDE.md` rendering; the
`solution-architect` agent; eight skills.

**Stage 2 — `:requirements` and `:spec`.** `requirements.json` and its validator; the FR
table, Gherkin, Kiro triad and OpenSpec renderers; the CLI integration and its deferred path;
the remaining two skills.

**Milestone check.** M3 is done when, from a clean scratch project with an approved
`:describe`, the four phases run in order to four approved gates; the three diagram formats
render and agree; `AGENTS.md` carries the drift block and the invariants; a criterion with no
feature fails validation; and the OpenSpec-unreachable path still produces three surfaces.
As with M2, a live run against a real Devpost hackathon stays a human call and is not counted
as a mechanical check.

---

## 13. Open questions

1. **Diagram legibility at scale.** The layout is tiered and deliberately naive. An
   architecture with twelve components in one tier will render wide and thin. The mitigation
   is editorial — tiers are a modelling choice, and a tier that wide is usually a modelling
   problem — but the emitters do not enforce it and there is no evidence yet about where the
   threshold sits.
2. **EARS fidelity.** Rendering Given/When/Then scenarios into EARS-form acceptance criteria
   is a mechanical transform of a form that was not designed for it. Relay's and Memoria's
   Kiro specs were hand-written; whether a generated one reads as well is untested.
3. **Whether four spec surfaces survive M4.** §6.4 names a reader for each. If M4 shows one of
   them going unread, it should be dropped rather than maintained.
4. **Waylo's repository was not read** — its Devpost link resolves to a GitHub organisation
   rather than a repository — so the corpus in §2 is ten repositories deep, not twelve.
