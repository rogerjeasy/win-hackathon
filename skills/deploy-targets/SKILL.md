---
name: deploy-targets
description: Selection criteria and time-to-first-URL for Vercel, Cloud Run, Railway, Render, AWS, and Docker Compose
---

# Choosing a deploy target

**Sponsor-mandated cloud always wins.** If a `stack.json` slot's `source` is `"required"`
and names a specific cloud, that slot deploys there — the same sponsor-wins precedence
`:stack` already applies to technology choices applies here too. Everything below is the
table for slots the rules leave open.

## The table

| Target | Best for | Time to first URL | Notes |
|---|---|---|---|
| **Vercel** | Next.js frontends, `next-monolith` repos | Minutes | The default for any Next.js slot with no sponsor mandate |
| **Cloud Run** | Containerized backends in a `multi-service` repo, GCP-adjacent stacks | ~10-20 min including image build | Scales to zero, good fit for a hackathon's traffic profile |
| **Railway** | Fast multi-service deploys without writing Terraform | Minutes | Good fallback when time is tighter than the Cloud Run/Terraform path allows |
| **Render** | Similar to Railway; a reasonable alternative when Railway itself is the sponsor's excluded platform | Minutes | |
| **AWS** | Sponsor-mandated AWS stacks (Bedrock, Aurora, etc.) | Highest setup cost of the list | Budget more of the ship-phase hours here than for any other target |
| **Docker Compose** | Local-only fallback when no cloud CLI is usable, or a milestone validation run | Seconds | First-class, not a failure state — `:ship`'s own milestone check targets this |

## Evidence

Both reference repositories chose differently: one deployed to a serverless
frontend-plus-managed-database target, the other split across a containerized multi-service
target with its own CI. Deploy target varies by sponsor in both — this table is a
selection aid, not a single recommendation, for exactly that reason.
