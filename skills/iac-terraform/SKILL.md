---
name: iac-terraform
description: Terraform module layout sized for a project with a two-day lifespan, not a production system
---

# Terraform for a hackathon project

## Module layout

```
infra/
  network/      VPC, subnets -- often skippable if the target platform manages this
  database/     the primary datastore, if any
  iam/          service accounts, WIF/OIDC provider bindings
  storage/      object storage buckets, if the app needs them
  messaging/    queues/pubsub, only if the architecture actually has one
  budget/       a cost alert -- cheap insurance against a runaway resource left on
```

Only create the modules the architecture actually needs — an empty `messaging/` module
that nothing references is scope, not infrastructure.

## State management for a short-lived project

**Local state is acceptable here.** A remote backend (GCS/S3 bucket + locking) is the
right call for a production system with multiple contributors applying over weeks; a
two-day hackathon project with one or two people rarely needs it. If the team is more than
two people or the project might outlive the hackathon, set up a remote backend — otherwise
local state with the state file gitignored (never committed — it can contain secrets) is
the pragmatic default. `deploy.json`'s `infra.state_backend` records which was chosen.

## Budget alert

A minimal cost-alert module belongs in every ship, sponsor cloud or not — a hackathon
project experimenting with generative AI or GPU instances left running past the deadline
is a real and common way to run up a bill nobody meant to authorize.
