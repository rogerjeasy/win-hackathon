---
name: data-modeling
description: Use at :architect — the twelve-section data-model doc Kintwadi (Best Design) shipped, entity grouping, the RLS policy taxonomy, and how to argue for a database rather than just list its features.
---

# The template

Kintwadi's `docs/data-model.md` is not a schema dump; it's an argued document, and its
section order is the argument. Twelve top-level sections, in this order:

1. **Why a relational model** — the case for the shape, before any table appears.
2. **Design principles (applied to every table)** — the conventions every entity inherits,
   stated once instead of repeated per table.
3. **Entity-relationship diagram**
4. **Entity catalog** — every entity, grouped (see below), with conceptual attribute types.
5. **Design call-out: the timeline as an activity-stream spine** — one section for the one
   modeling decision that's load-bearing enough to deserve its own explanation.
6. **Transactions & integrity (ACID)**
7. **Role-based access control — the capability matrix**
8. **RLS in one sentence** — the whole security model, compressed to something a reader can
   hold in their head before the detailed policy section.
9. **Row-Level Security policy design** — the taxonomy (below).
10. **Indexing & performance (conceptual)**
11. **Why [this database] over [the alternative] *for this model*** — a comparative
    argument, not a feature list.
12. **Scope & forward-compatibility** — what's MVP, what's deferred, and what the shape
    buys you later.

Use this as the spine for a new project's data-model doc, not a fixed page count — a project
with no RBAC has nothing to put in section 7, and that's a correct, honest gap, not a
section to pad.

## Entity grouping

Section 4 doesn't list entities alphabetically or in creation order; Kintwadi groups them
into four categories, and the grouping itself carries meaning:

- **Identity & tenancy** — `user`, `care_circle` (the tenant), `care_recipient_profile`,
  `membership` (the access principal every RLS policy consults), `invitation`.
- **Operations** — the domain entities the product actually exists to manage
  (`medication`, `task`, `observation`, and so on for Kintwadi's care-coordination domain).
- **Collaboration & system** — cross-cutting entities like the timeline/activity stream,
  comments, and the audit log.
- **AI layer** — anything vector-backed (`care_record_chunk` with `pgvector`), kept as its
  own group because it inherits tenant policies rather than living outside them (see below).

Grouping this way makes tenancy the first thing a reader learns, before they learn what the
product does — which matches the order the RLS policies themselves are read in.

## The RLS policy taxonomy

Section 9 isn't one policy repeated with different table names; it's five distinct shapes,
and a real schema will use several of them at once:

- **Tenant isolation** — applies to *every* tenant-scoped table: the row's tenant key is in
  the current user's set of active memberships. Non-negotiable, unconditional, and — because
  the tenant key lives on every row — a single indexed check rather than a recursive join.
- **Role-gated writes** — per-command policies keyed on the caller's role within that
  tenant (e.g., only an Owner or Family Admin may insert/update/delete a `medication` row).
  Reads can be open where writes are gated.
- **Sensitivity-scoped reads** — the central access rule for anything with a sensitivity
  tier (Kintwadi's `document`: `general` / `medical` / `financial` / `legal`), where tenant
  isolation holds *and* the caller's role must additionally clear the row's sensitivity
  level. This is what keeps a hired aide from reading a family's financial documents even
  though they're a legitimate member of the tenant.
- **Append-only audit** — insert allowed, select restricted to privileged roles, and
  **update/delete have no policy at all and the privilege is revoked** — so the table is
  immutable to the application role, not just conventionally treated as immutable.
- **Vector rows under the same policies** — `pgvector` tables carry the tenant key and the
  same tenant-isolation policy as everything else, so semantic search inherits security: a
  similarity query physically cannot retrieve another tenant's rows, even by accident. Filter
  by tenant first, then run the ANN search inside that scope.

The database is meant to be the last line of defense in this model: if application code
forgets a `WHERE` clause, tenant isolation and role-gating still hold, because they're
enforced in the engine, not in a query the app remembered to write correctly.

## A new tenant-scoped table needs its policy in the same change

This is the rule that keeps the taxonomy from decaying: a migration that adds a new
tenant-scoped table and does **not** add its RLS policy in that **same change** ships a hole
— a table with no isolation policy is readable by anyone who can reach the database role,
not just the tenant that owns its rows. Don't treat "add the policy" as a follow-up ticket;
a table without RLS is not a smaller version of a correctly-scoped table, it's an unscoped
one, for however long the follow-up takes.

## "Why this database for this model" is an argument, not a spec sheet

Section 11 in Kintwadi's doc is a comparison table — Aurora PostgreSQL vs. DynamoDB — scored
against requirements the *model* actually has: cross-entity atomic writes, ad-hoc joins for
aggregate views, row/column-level access control enforced in-engine rather than hand-rolled
in app code, referential integrity across dozens of entities, and semantic search living
beside the operational data instead of in a separate synced store. The conclusion follows
from the requirements, not from "Postgres is popular" or a feature checklist copied from a
vendor page. Write this section the same way: name what the model actually needs, then show
which database satisfies which need — and be honest when the alternative would win on a
requirement this model doesn't have (DynamoDB's single-key throughput, for instance, that
this domain's relationship-rich access pattern never asked for).
