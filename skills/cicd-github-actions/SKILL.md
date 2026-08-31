---
name: cicd-github-actions
description: Path-filtered per-service deploy workflows with keyless WIF/OIDC auth, test-then-deploy ordering
---

# CI/CD for a multi-service hackathon repo

## Path-filtered per service

Only the changed service's pipeline runs. One workflow file per service, each scoped with
`paths:`:

```yaml
name: deploy-web
on:
  push:
    branches: [main]
    paths: ['web/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # required for keyless auth
      contents: read
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
        working-directory: web
      - name: authenticate (WIF/OIDC)
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.DEPLOY_SA }}
      - run: gcloud run deploy web --source web --region us-central1
```

`next-monolith` repos need only one such workflow, filtered on the whole repo (no
`paths:` restriction is meaningful when there is only one service).

## Test-then-deploy, always in that order

The deploy step never runs before the test step in the same job. A red test blocks the
deploy — this is the cheapest possible guard against shipping something `:check` would
have failed anyway.

## Keyless auth is the default, not an option

WIF (GCP) or OIDC (AWS/Vercel where supported) — no long-lived cloud credentials as
repository secrets. `permissions: id-token: write` is what makes the OIDC token exchange
possible; forgetting it is the most common reason this pattern silently falls back to
failing rather than to a static secret.
