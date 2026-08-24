# Invariants corpus

## Why this corpus exists

Four winning repositories, four different answers to "what belongs in the agent contract."
Kintwadi answers with a numbered, enforcement-anchored list in `AGENTS.md`. Sonar answers
with nothing but a five-line drift banner — no security section at all. HYPE answers with a
judge-facing `## Invariants` section in an architecture doc, not an agent contract. Karma
answers with an ordinary architecture-doc bullet list, no agent contract in the repo at all.
All four won. The point of this corpus is the range, not one template — a shape copied
without asking whether the project's access-control story actually supports it produces
invented rules, and invented rules are worse than no rules.

## Kintwadi — the numbered invariants contract (Best Design)

Kintwadi's `AGENTS.md` (`examples/zero-hackathon/kintwadi/AGENTS.md`) carries a section
titled "🔒 Security invariants — ALWAYS enforce these (non-negotiable, for the entire
project)," opening with "Authentication and authorization are **defense-in-depth and
fail-closed**. Never weaken any layer." Six numbered invariants follow, quoted here with
each one's enforcement point:

1. **Protected-by-default routing.** "Every authenticated page lives under
   `src/app/(app)/`. That route group's `layout.tsx` runs `requireSession()` on the server
   and redirects unauthenticated users to `/sign-in`. Protection is the DEFAULT — do NOT
   add a per-page opt-in." — `enforced_by`: `src/app/(app)/layout.tsx` (`requireSession()`).
2. **A fail-closed edge allowlist.** "`proxy.ts` is fail-closed: every route is gated
   unless explicitly listed in its public allowlist. … This is only the optimistic edge
   layer — never the sole guard." — `enforced_by`: `proxy.ts`.
3. **DAL-enforced tenancy.** "All tenant data access goes through `withAuthedDb()`
   (src/db/dal.ts), which runs queries inside an RLS-scoped transaction
   (`app.current_user_id`). Never query tenant tables with the raw `db` client in a
   request handler." — `enforced_by`: `withAuthedDb()` in `src/db/dal.ts` (Aurora
   Row-Level Security is named as "the final guarantee").
4. **Re-checked mutations.** "Server actions and route handlers must re-check auth
   themselves (`requireSession()` / `auth()`), and authorize the specific action against
   the user's role/membership. Never trust the client or assume the proxy/layout already
   ran for a mutation." — `enforced_by`: `requireSession()` / `auth()`, called again inside
   every server action and route handler.
5. **Secret hygiene.** "Secrets stay server-side, in env vars (never committed). Passwords
   are hashed (`src/lib/password.ts`); reset tokens are stored hashed and are
   single-use + short-lived." — `enforced_by`: env vars plus `src/lib/password.ts`.
6. **Dual audit + operational logging.** "Audit every sensitive / state-changing action
   for traceability — everywhere, including all incoming features," via
   `recordAuditEvent(userId, {...}, tx?)` into an append-only `audit_log`, paired with
   `serverLog(area, action, 'start'|'success'|'failure', meta)` on both success and
   failure paths. — `enforced_by`: `recordAuditEvent()` in `src/db/audit.ts` and
   `serverLog()` in `src/lib/log.ts`.

The numbered list closes with: **"If a change would bypass any of the above, stop and flag
it instead of shipping it."**

Two more sections follow that closing line — "Platform super-admin (cross-tenant)" and
"Logging hygiene (applies to every log statement)" — so the stop-and-flag sentence ends the
**numbered list**, not the file. It is a scoping device inside a longer document, not a
document-final sign-off.

## Sonar — the banner alone (First Place, Million-scale Global)

Sonar's entire `AGENTS.md` (read via
`gh api repos/mattrickslauer/sonar/contents/AGENTS.md`) is five lines, byte-identical to
Kintwadi's drift banner and nothing else:

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

No security section. No invariants. No architecture notes. **This is the row that matters
most in this corpus:** Sonar won first place in the Million-scale Global track with an
agent contract that says nothing but "the framework moved, go read the docs." A short
contract is not an unfinished contract — it is evidence that the honest length of an
`AGENTS.md` is whatever the project's actual risk surface calls for, and for Sonar that
was zero lines of security invariants.

## HYPE — invariants as a judge-facing section (Best Technical Implementation)

HYPE has no `AGENTS.md`. Its `docs/architecture.md` (read via
`gh api repos/jpablortiz96/HYPE/contents/docs/architecture.md`) carries a `## Invariants`
section aimed at a reader who wants proof the ledger cannot be gamed, not at an agent
about to write code:

> HYPE verifies two exact invariants:
>
> ```txt
> sum(user.cash) + sum(asset.reserve) === sum(user.granted)
> asset.reserve === reserveAt(base, slope, supply)
> ```
>
> Because money is stored as integer micro-units, the check is exact. There is no floating
> point tolerance and no reconciliation process.

Note the shape shift: these are accounting invariants, not access-control invariants —
HYPE's "trust boundary" argument is about solvency math (checked by an integrity engine
against Aurora DSQL), not about who is allowed to call which route. It is still evidence
for the family: an invariant is any rule that holds for the life of the project and names
where it is checked, and the form generalises past security into any judge-facing
correctness guarantee a project actually enforces.

## Karma — security as an architecture section (Second Place, Dynatrace)

Karma has no agent contract at all. Its `docs/ARCHITECTURE.md` carries an ordinary
`## Security Considerations` section — a bullet list, not a numbered invariants contract:

- All secrets via **Secret Manager** — never in environment variables or code
- Dynatrace Platform Token stored as Secret Manager secret `dt-api-token`
- Firebase Auth enforces authentication on the dashboard; API validates Firebase ID tokens
- Admin routes require `admin` role in `users/{uid}.roles` (checked server-side)
- Cloud Run services are internal-only where possible (API only exposes what the dashboard needs)
- `DT_QUERY_TOKEN` (classic API, `storage:spans:read` scope) kept separate from
  `DT_API_TOKEN` (Platform Token, MCP gateway)
- No user data stored in Memory Bank — only service telemetry patterns
- GitHub token is a fine-grained PAT with `contents:read` + `pull-requests:read` only

The recurring themes: secrets never live in env vars or code (Secret Manager only), token
scopes are separated by purpose, and role checks run server-side, not in the client. No
enforcement anchors are named the way Kintwadi names files and functions — this list reads
as documentation of decisions made, not as a contract an agent is bound to re-check before
every change.

## What generalises

- **An invariant worth writing names its enforcement point.** Kintwadi's six all say which
  file or function does the enforcing. Karma's list mostly doesn't, and reads weaker for it.
- **A numbered list closing with a stop-and-flag line is a scoping device for that list**,
  not a requirement that every project produce one — Sonar and Karma both won without it.
- **The word "invariant" is not exclusively a security term.** HYPE uses it for ledger
  correctness. The form — a rule, stated exactly, with a named check — travels; the content
  does not have to be about auth.
- **Scope the list to the security story the project actually has.** A CRUD app with no
  multi-tenancy has nothing to say about row-level security, and inventing an RLS invariant
  for it would be a wish, not a rule. Write the invariants the architecture earns, in the
  number the architecture earns, and stop — Sonar shipped zero and still took first place.

## What this corpus cannot say

These four rows were read from the outside — the published `AGENTS.md` and architecture
docs as they exist today — not from commit history, so there is no way to say from this
corpus whether Kintwadi's invariants were written before or after the code they describe,
whether Karma ever had a fuller contract that was trimmed, or how any of these documents
changed over the course of the hackathon. Two of the four projects, Kintwadi and Karma, are
the plugin author's own repositories; the other two, Sonar and HYPE, were read solely
through the GitHub contents API, one file each, with no broader exploration of either
codebase. Treat every row as a snapshot of a public document, not as a verified claim about
what the running system actually does.
