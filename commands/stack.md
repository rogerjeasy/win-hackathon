---
description: Resolve the technology stack — sponsor mandates first, personal defaults filling the gaps, every slot with a reason
allowed-tools: Bash, Read, Write
---

Resolve the stack for this project.

Load the `monorepo-structure`, `sponsor-tech-thesis` and `framework-drift-guard` skills
before starting.

## Step 1 — Read the inputs

Read `.hackathon/recon.json` (required and forbidden tech, the rubric), `.hackathon/project.md`
(the product) and `.hackathon/strategy.md` (the thesis and the track).

## Step 2 — Resolve each slot under sponsor-wins precedence

1. **Required sponsor tech is fixed.** It cannot be traded away for something you like
   better. Every entry in `recon.tech.required` gets a slot with `source: "required"` and a
   `requirement_ref` naming it.
2. **Personal defaults fill open slots** the rules leave unspecified: Next.js (latest) +
   TypeScript + Tailwind + shadcn/ui on the frontend; FastAPI + Poetry on the backend.
3. **Bonus tech is adopted only when its cost is proportionate to its scoring value.**
   Adopting a sponsor's optional SDK to chase a small bonus, at the cost of a day, is a bad
   trade under a deadline. Say so rather than adopting it silently.
4. **Every slot records a rationale** — why this choice, not merely what it is.

Exactly one slot should carry the thesis (`thesis_support: "carries"`). That is the
technology a competitor using something else could not claim. If nothing carries it, the win
argument in `strategy.md` has no architecture behind it — go back to `strategy.md` rather
than inventing a claim here.

## Step 3 — Choose the repository shape

| Shape | When |
|---|---|
| `next-monolith` | Next.js full-stack, server actions, no separate API surface |
| `multi-service` | separate `web/`, `api/`, `agents/`, each independently deployable |

`monorepo-structure` has the criteria and what each shape costs.

## Step 4 — Write and validate

Write `.hackathon/stack.json`, then run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/stack.mjs validate .hackathon/stack.json`

The script prints every problem at once. Fix them all, then re-run. **At most two retries** —
a third is a loop, not a fix, so stop and show the user the errors.

## Step 5 — Apply

`node ${CLAUDE_PLUGIN_ROOT}/scripts/stack.mjs apply .`

## Step 6 — Stop at the gate

Show the user the slot table and the rejected alternatives. Ask whether to proceed.
**Do not continue to `:architect` without an explicit yes.** The phase is
`awaiting_approval` and `:next` will not advance past it.
