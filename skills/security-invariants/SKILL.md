---
name: security-invariants
description: Use at :architect — generates the fail-closed, defense-in-depth AGENTS.md invariants contract from the architecture's access-control model, scaled honestly to the project
---

# What an invariant is

A rule that holds for the life of the project, with a named place in the code that
enforces it. "Users can only see their own data" is a wish. "All tenant data access goes
through `withAuthedDb()`, which runs queries inside an RLS-scoped transaction" is an
invariant — it says what must always be true and exactly where that truth is checked. If a
rule can't be pointed at a file or a function, it isn't ready to go in `AGENTS.md` yet.

## The shape

Numbered, imperative, and each one names its `enforced_by` — the file, function, or
mechanism that actually makes the rule true, not the intention behind it. The list closes
with one fixed sentence:

**"If a change would bypass any of the above, stop and flag it instead of shipping it."**

That sentence scopes the list — it tells an agent what to do when an invariant and a
requested change collide — and nothing about the shape requires it to be the last line of
the file; sections that need to exist outside the numbered contract (cross-tenant admin
access, logging hygiene) can and should follow it.

## Families worth considering

These aren't a checklist to fill regardless of the project — each is named here because
Kintwadi's `AGENTS.md` proves it is a real, load-bearing rule in a winning project, not a
theoretical one. See `references/invariants-corpus.md` for the full quoted text and anchors.

- **Protected-by-default routing** — an entire route group is gated by a layout that runs
  once, so new pages are secure by placement, not by remembering to add a check.
  `enforced_by`: `src/app/(app)/layout.tsx` (`requireSession()`).
- **A fail-closed edge allowlist** — the edge layer denies by default and only an explicit
  allowlist entry opens a route, so a route nobody thought to add is protected, not exposed.
  `enforced_by`: `proxy.ts`.
- **DAL-enforced tenancy** — one data-access function is the only path to tenant rows, and
  it runs inside a row-level-security transaction, so a raw query can't accidentally cross a
  tenant boundary. `enforced_by`: `withAuthedDb()` in `src/db/dal.ts`.
- **Re-checked mutations** — every server action and route handler re-verifies auth itself
  instead of trusting that an earlier layer already ran. `enforced_by`: `requireSession()` /
  `auth()`, called again at the point of mutation.
- **Secret hygiene** — secrets stay server-side in env vars, never committed; sensitive
  values (passwords, reset tokens) are hashed and single-use where applicable.
  `enforced_by`: env vars plus a hashing utility (Kintwadi: `src/lib/password.ts`).
- **Dual audit and operational logging** — every sensitive or state-changing action writes
  both a durable audit row and an operational log line, on success and failure alike.
  `enforced_by`: `recordAuditEvent()` in `src/db/audit.ts` and `serverLog()` in
  `src/lib/log.ts`.

Only include a family the architecture actually has. A project with no multi-tenancy has no
DAL-enforced-tenancy invariant to write, and writing one anyway invents a rule nothing
enforces.

## Scaling honestly

Sonar is the evidence that a banner-only `AGENTS.md` — no security section, no invariants,
just the framework-drift banner — won first place in the Million-scale Global track. The
number of invariants a project earns is not a proxy for how seriously the judges will take
it, and it is not a proxy for effort either. **Never pad the list to look thorough.** An
architecture with one real access-control decision gets one invariant. An architecture with
none — a single-user tool, a public read-only demo — gets zero, and that is a correct
output, not an unfinished one.

## The reader

`AGENTS.md` is read by an agent that is about to write code, under time pressure, usually
without re-reading the whole architecture doc first. An invariant that agent cannot check
against something concrete — no named file, no named function — reads as a suggestion, and
a suggestion competing with a deadline loses. An invariant it cannot check is worse than no
invariant: it creates the appearance of a guardrail where none exists, which is more
dangerous than an honest, visible gap.

## Reference

`references/invariants-corpus.md` has all four shapes from this skill's evidence base —
Kintwadi's full numbered contract, Sonar's five-line banner, HYPE's ledger-invariants
section, and Karma's plain security bullet list — each quoted, not paraphrased. Read it
before writing a contract for an unfamiliar architecture shape.
