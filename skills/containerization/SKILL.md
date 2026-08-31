---
name: containerization
description: Per-service, multi-stage Dockerfiles sized for a two-day project, not a production system
---

# Containerization under a deadline

**One Dockerfile per service.** `next-monolith` gets exactly one at the repo root;
`multi-service` gets one per deployable directory (`web/Dockerfile`, `api/Dockerfile`,
`agents/Dockerfile`, ...) — the repo shape `:stack` already chose determines the count.

## Multi-stage, always

A build stage with the full toolchain, a runtime stage with only what the running process
needs. This is what keeps image size and cold-start time down without hand-tuning either.

```dockerfile
# build
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# runtime
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
CMD ["npm", "start"]
```

Swap the base image and build/start commands per service's actual stack — FastAPI's
runtime stage installs via `poetry export` or `pip install -r requirements.txt` rather
than `npm ci`, for example.

## Under time pressure

Don't chase the smallest possible image. A `-slim` base and a two-stage build is enough;
distroless or Alpine-specific tuning is a post-hackathon optimization, not a ship-phase
one.
