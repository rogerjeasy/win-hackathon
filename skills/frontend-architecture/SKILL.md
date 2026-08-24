---
name: frontend-architecture
description: Use at :architect — Next.js App Router structure as Kintwadi (Best Design) built it, protection as the default rather than a per-page opt-in, and where the data-access layer sits.
---

# The layout runs the guard, not the page

Kintwadi's `AGENTS.md` states the routing invariant in one sentence: every authenticated
page lives under `src/app/(app)/`, and that route group's `layout.tsx` runs
`requireSession()` on the server, redirecting unauthenticated users to `/sign-in`. Nothing
inside the group has to remember to check auth — the layout already ran before any page
component executes. That is protection as the default, not an opt-in — a new screen only
has to land in the right folder to be secured; there is no separate opt-in step to remember.
Public routes (marketing, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`,
`/pricing`, `/how-it-works`, `/invite/*`, `/style-guide`) live *outside* the group,
deliberately — the group's boundary is the security boundary, not a naming convention
layered on top of one.

Route a new screen wrong — inside the public tree because it "just needs one quick check" —
and it ships unauthenticated. Route it right and it inherits the guard for free. There is no
third option, no per-page `if (!session) redirect()` to remember or forget.

## `proxy.ts` is the second layer, not the first

Kintwadi also runs a fail-closed edge allowlist in `proxy.ts`: every route is gated unless
explicitly listed as public. If a route isn't on the allowlist, it stays protected, even if
nobody remembered to add it — the safe failure mode is "blocked," not "open." But
`AGENTS.md` is explicit that this is *only* the optimistic edge layer, never the sole guard:
edge middleware runs on limited context (no DB round-trip, coarse session signal) and exists
to fail fast and cheap, not to be the last word. The `(app)/layout.tsx` server check is
primary; `proxy.ts` is the fast, approximate check in front of it. Treat the two as
defense-in-depth, not as interchangeable — a route that only the edge layer protects is a
route one config typo away from being public.

## Server vs. client components

Default to server components; reach for `'use client'` only where interactivity requires it
(forms, local state, browser APIs). A server component can read the session and query the
DAL directly, so most of a screen's data-fetching and access logic never ships to the
browser at all. Client components should be the leaves of the tree — a button, a form, a
toggle — not the page itself. A page-sized client component re-implements everything the
server boundary was supposed to buy you: it re-fetches over the network, re-checks nothing
server-side by default, and ships all of that code to every visitor.

## The DAL is the only path to tenant data

All tenant data access goes through one function — Kintwadi's `withAuthedDb()` in
`src/db/dal.ts` — which runs queries inside an RLS-scoped transaction
(`app.current_user_id`). A request handler or server action never queries tenant tables with
the raw `db` client directly; if it did, it would bypass the transaction that scopes rows to
the caller's tenancy, and Aurora's row-level security would be the only thing standing
between that query and a cross-tenant read. The DAL is a chokepoint by design: one function
to audit, one place the RLS session variable gets set, one place a future change to the
tenancy model has to touch.

## Server actions re-check auth themselves

The layout ran `requireSession()`. The edge allowlist let the request through. Neither of
those facts is available inside a server action or route handler at the point it executes —
a mutation must call `requireSession()` / `auth()` again and authorize the specific action
against the caller's role or membership, rather than trusting that some earlier layer
already verified it. This is not redundancy for its own sake: a server action can be invoked
directly (a stale client, a replayed request, a future caller that doesn't go through the
page at all), and the moment it trusts an upstream check it can't itself observe, it has a
hole. Every mutation re-establishes who is calling and what they're allowed to do, on its
own terms.

## The shape, in order

1. Route group (`(app)/layout.tsx`) — `requireSession()`, the default, non-optional guard.
2. `proxy.ts` — fail-closed edge allowlist, the fast optimistic layer, never the only one.
3. Server components by default; `'use client'` only at interactive leaves.
4. DAL (`withAuthedDb()` / equivalent) — the sole path to tenant rows, RLS-scoped.
5. Server actions / route handlers — re-check auth and authorization at the point of
   mutation, independent of steps 1–2.
