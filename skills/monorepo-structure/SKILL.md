---
name: monorepo-structure
description: Use at :stack — choosing between a next-monolith and a multi-service repository shape, with both shapes as measured in winning repositories.
---

# Repository shape

`:stack` picks one of two shapes, once, before anything else gets written. Both shapes below
are measured directly from a winning repository's working tree, not sketched from what a
Next.js monorepo "usually" looks like.

## next-monolith

Kintwadi (Best Design) is one Next.js app. The marketing site, auth, and the entire
authenticated product live inside a single `src/`, and the thing that would normally need its
own deploy target is instead a route group.

```
$ ls src/app
(app)
about
api
blog
contact
e
favicon.ico
forgot-password
globals.css
hipaa
how-it-works
invite
layout.tsx
manifest.ts
page.tsx
pricing
privacy
reset-password
security
sign-in
sign-up
style-guide
terms
```

`(app)` is a Next.js route group — the parenthesised segment is stripped from the URL, so
everything inside it (`dashboard`, `people`, `medications`, `appointments`, `incidents`,
`admin`, twenty folders total) resolves to `/dashboard`, `/people`, and so on, while sharing
one `layout.tsx` that gates every one of them on a session check. It sits as a sibling to
`about`, `pricing`, and `sign-in` inside the *same* `src/app` — the public marketing shell and
the protected product are one deploy artifact, distinguished only by which folder a route
lives in.

```
$ ls src/db
__tests__          admin-queries.ts  demo-incident.ts  invitations.ts  rls.ts             setup-notify.ts
admin-db.ts        audit.ts          index.ts          queries.ts      schema
dal.ts                                                                 seed.ts             setup-app-role.ts
```

`dal.ts` is the Data Access Layer server actions write through. Because writes go through the
DAL rather than a separate API, there is no second service for a write path to live in front
of — the boundary is a module, not a deploy target.

```
$ ls infra .github/workflows
infra:
README.md  budget.tf  database.tf  iam.tf  messaging.tf  network.tf  outputs.tf  providers.tf
storage.tf  terraform.tfstate  terraform.tfvars  terraform.tfvars.example  variables.tf  versions.tf

.github/workflows:
ci.yml  cron.yml
```

One flat `infra/` of plain `.tf` files — not one Terraform tree per service — and two
workflows: `ci.yml`, and `cron.yml` for scheduled jobs. One repository, one pipeline, one cron.

## multi-service

Karma (Second Place, Dynatrace) ships three deployables that genuinely differ in runtime,
scaling profile, and deploy cadence: a Next.js frontend, a FastAPI gateway, and a Python agent
service.

```
$ ls
agents  api  web  bindplane  cloudbuild-api.yaml  cloudbuild-web.yaml  docs
firebase-service-account.json  firestore.indexes.json  infrastructure  package.json  package-lock.json
progress  scripts  synthetic-env

$ ls web
Dockerfile  app  components  eslint.config.mjs  instrumentation.ts  lib  next-env.d.ts
next.config.ts  package.json  postcss.config.mjs  public  tailwind.config.ts  tsconfig.json

$ ls api
Dockerfile  README.md  app  pyproject.toml  scripts  tests

$ ls agents
Dockerfile  README.md  karma  pyproject.toml  tests
```

`web/`, `api/`, and `agents/` each carry their own `Dockerfile`; `api/` and `agents/` each
carry their own `pyproject.toml`, because they are two independent Python packages, not one
shared one. There is no root `Dockerfile` and no shared Python project file — each service
builds as if it were the only thing in the repository.

```
$ ls .github/workflows infrastructure
.github/workflows:
deploy-agents.yml  deploy-api.yml  deploy-synthetic-env.yml  deploy-web.yml  publish-packages.yml

infrastructure:
setup-dynatrace.ps1  setup-dynatrace.sh  setup-wif.ps1  terraform
```

Four of the five workflows are path-filtered: `deploy-web.yml` triggers only on `paths:
web/**`, `deploy-api.yml` only on `api/**`, `deploy-agents.yml` only on `agents/**`,
`deploy-synthetic-env.yml` only on `synthetic-env/**` — a change to one service deploys only
that service, never the other two. The fifth, `publish-packages.yml`, fires on a GitHub
release rather than a path filter. `infrastructure/terraform` holds one Terraform tree
covering all three services, and `setup-wif.sh` / `setup-wif.ps1` set up Workload Identity
Federation so each deploy workflow authenticates to GCP without a long-lived key.

## Choosing

Pick **multi-service** when a component has a genuinely different runtime, scaling profile, or
deploy cadence than the rest of the app. Karma's agent service runs long-lived Python
processes on a scaling curve that has nothing to do with its Next.js frontend's request
traffic — folding them into one deployable would mean scaling the frontend just to scale the
agents.

Pick **next-monolith** when server actions cover the writes. A second service is never free:
it costs a network hop the monolith doesn't pay, a second deploy target that has to stay
green, and a second set of secrets to provision and rotate. Kintwadi's DAL absorbs every write
the product needs without paying any of that, which is why it never grew a second service at
all.

**Under a deadline, next-monolith is the cheaper default.** One repository, one CI pipeline,
one place to look when something breaks, and the whole product ships from a single `git push`.
Multi-service earns its cost only when the alternative — one service doing two jobs at two
incompatible scales — is the more expensive failure to ship with. Reach for it because a
service needs it, not because a monorepo felt more "real" under judging.
