---
name: framework-drift-guard
description: Use when a stack pins a fast-moving framework — generates the "This is NOT the framework you know" banner that stops an agent writing code from stale training data
---

# The problem

A fast-moving framework's current API can differ from what an agent learned in training —
route conventions, config file shape, even which primitives still exist. An agent that
doesn't know this writes confident, fluent, wrong code: it compiles in the agent's head and
fails against the actual `node_modules` on disk. The fix is not "know more" — it's forcing a
read of the installed docs before the first line of code, every session, for exactly the
dependencies where drift is likely.

## The canonical banner

This is the literal text to emit, unedited except where noted below. Keep the HTML comment
markers — they let a later pass find and update the block without touching anything else in
`AGENTS.md`.

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
```

## The evidence

Kintwadi (Best Design) and Sonar (First Place, Million-scale Global) — two unrelated
winning projects, different teams, different hackathons — ship this banner byte-identical.
Sonar's entire `AGENTS.md` is these five lines and nothing else. That is not a coincidence
of two people copying each other; it is evidence that this exact wording is a settled form
for the problem, not something to workshop. See
`../security-invariants/references/invariants-corpus.md` for both banners quoted in full
alongside where they sit in the corpus.

## How to adapt it

Only two things change per project: the framework name (both the `nextjs` in the marker
comment and the two "Next.js" mentions in the body become the pinned framework's name), and
the docs path (`node_modules/next/dist/docs/` becomes wherever that framework's docs
actually land after install). Everything else — the sentence structure, "breaking changes,"
"may all differ from your training data," "Heed deprecation notices." — stays verbatim. This
is a template to fill in, not a draft to rewrite.

## Where the docs path comes from

Read it from `stack.json`, at `bleeding_edge[].docs_path` — do not guess a path or invent
one from the framework's public documentation site. The stack file is what the architecture
phase actually pinned, and `docs_path` is the field that names where the installed copy of
the docs will be once the dependency is installed, which is the only copy an agent should
trust over its own training data.

## When not to emit a banner

A stable, well-known dependency does not need one — a banner is for a framework whose
current behavior an agent is likely to get wrong from training data, not a general warning
label to staple onto every dependency in `package.json`. If nothing in `stack.json`'s
`bleeding_edge` list names the framework, there is nothing pinned to warn about, and a
banner for a framework nobody pinned is noise: it trains the reader to skim past the next
one, including the one that actually matters. Emit the banner only for entries that are
actually in `bleeding_edge`, one banner per entry, and nothing for the rest of the stack.
