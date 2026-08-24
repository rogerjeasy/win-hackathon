---
name: backend-architecture
description: Use at :architect — FastAPI service structure as Karma (Second Place, Dynatrace) built it, the gateway/agent-service split, secret handling, dependency injection, and error contracts that don't leak internals.
---

# Split by what deploys independently, not by folder taste

Karma is not one FastAPI app; it's a **gateway** (`api/`, FastAPI on Cloud Run) that talks to
an **agent service** (`agents/`, the ADK agent system on Vertex AI Agent Engine) over its own
task-invocation boundary. The two ship on separate GitHub Actions workflows —
`deploy-api.yml` targets Cloud Run, `deploy-agents.yml` targets Agent Engine — and run in
parallel on every push to main, alongside the web and synthetic-env deploys. The gateway
owns HTTP concerns: routing, auth, request validation, Firestore reads/writes. The agent
service owns long-running agent reasoning and holds its own state (Memory Bank). Neither
redeploying the gateway nor a slow agent invocation blocks the other, because they are
genuinely different deploy targets, not two folders sharing one process.

The question worth asking before drawing this line: does this piece of logic have a
different scaling shape, a different deploy cadence, or a different failure mode than the
rest of the service? Karma's agents run long (learning a service's contracts can take
minutes) and need a durable runtime; the gateway needs to answer a dashboard request in
milliseconds. That mismatch is the actual argument for the split — not "microservices are
more architecturally serious."

## Secrets live in a secret manager, not in env vars

Karma's own security section is unambiguous: **all secrets via Secret Manager — never in
environment variables or code.** The Dynatrace Platform Token is stored as the Secret
Manager secret `dt-api-token`; env vars in the deployed services hold references, not
values. This matters beyond hygiene — env vars leak into process listings, crash dumps, and
log capture far more easily than a secret manager's access-controlled fetch does, and a
secret manager gives you rotation and per-service scoping that a `.env` file cannot.

## Separated token scopes, not one powerful token

Karma keeps **three distinct Dynatrace tokens**, each scoped to what actually needs it,
rather than one token with every permission:

- `DT_API_TOKEN` — a Platform Token, scoped to the MCP gateway (Bearer auth), used by the
  agent service.
- `DT_OTEL_TOKEN` — a classic API token scoped to OTel ingest, BizEvents, SLOs, and events —
  used by both agents and the API.
- `DT_QUERY_TOKEN` — a classic API token scoped to Grail *read* only, used by the API for
  agent-observability queries.

The GitHub token follows the same rule: a fine-grained PAT with `contents:read` +
`pull-requests:read` only, nothing broader. The principle generalizes past Dynatrace: give
every credential the narrowest scope the calling code needs, and give different calling code
different credentials, so a single leaked token bounds the blast radius instead of handing
over the whole platform.

## Dependency injection at the route boundary

Karma resolves "who is calling" once, as a FastAPI dependency, and every protected route
just declares it needs that dependency rather than re-implementing the check:

```python
async def endpoint(user: dict[str, Any] = Depends(get_current_user)):
    uid = user["uid"]
```

`get_current_user` (in `app/auth.py`) verifies the Firebase ID token and raises 401 itself
if it's missing, expired, or invalid — the route body never sees an unauthenticated request.
The same pattern extends to anything a route needs but shouldn't construct itself: a
Firestore client, a settings object, a role check. Declaring the dependency in the function
signature makes the requirement visible at the route (and testable in isolation, by
overriding the dependency) instead of buried in the function body.

## The DAL boundary applies here too

Karma's `firestore_client.py` is a thin wrapper around `google-cloud-firestore` that owns
every collection access (`users/`, `services/`, `contracts/`, `violations/`,
`ghost_reports/`). Routes call into it; they don't construct their own Firestore queries
inline. The same argument as the frontend DAL applies on the backend: one chokepoint means
one place to audit for a missing scope check, one place to change if the storage layer
changes, and no route quietly growing its own slightly-different query for the same data.

## Error contracts that don't leak internals

A user-facing response should never carry a raw exception string. Karma's routes generally
log the exception (`logger.warning(...) `/ `logger.error(...)`, with `error=str(exc)` going
to structured logs) and return a stable, generic message to the client — the raw exception
belongs in the log line an operator reads, not in the JSON a browser parses. A stack trace
or a database driver's error text can carry table names, query shapes, or internal hostnames
that are exactly what an attacker wants and exactly what a user doesn't need. Treat "log the
real error, return a contract" as the default shape for every `except Exception` block that
sits behind a route — not "log the real error, and also return it because it was
convenient."

## The shape

1. Split services where the deploy cadence or scaling shape actually differs (gateway vs.
   agent runtime), each independently deployable — not by folder taste.
2. Secrets in a secret manager, referenced by name, never inlined as plaintext env values.
3. One credential per scope; never widen a token because a second caller showed up.
4. Auth and shared context resolved once as a dependency at the route boundary, not
   re-implemented per handler.
5. One DAL module per datastore; routes call into it, never construct raw queries inline.
6. Errors: log the real exception, return a stable contract — never the exception string.
