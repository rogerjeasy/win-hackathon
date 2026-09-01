---
name: judge-ready-readme
description: The README-as-landing-page structure -- live demo first, why-this-tech placed before any badges table, security model, optional demo-data and disclosure sections
---

# A README a judge actually reads first

Judges are not required to test the project and may judge from the text description,
images, and video alone. The README is often the first thing they open. Structure it as a
landing page, not a wiki.

## Order, top to bottom

1. **Live demo link, first.** Before any badge row.
2. **The tech-thesis quote, as the first blockquote after the title -- before any badges
   or results table.** Not buried in "How we built it." Both `karma` and `kintwadi`
   place it here: Karma's "Built on Google Cloud's Vertex AI Agent Builder…" is the first
   prose after the title block, before its own results table. Kintwadi's "Which AWS
   database, and why" is section two, immediately after "What it is." This is the same
   finding `sponsor-tech-thesis` records about Devpost's own submission text (top-level
   heading, high in the document) — the README gets the identical treatment, one screen
   earlier than the form.
3. **What it is / the problem**, in plain language.
4. **Features.**
5. **Security** — point at `AGENTS.md`, do not restate its invariants. A judge who wants
   the detail can open it; the README's job is to say the model exists and is enforced.
6. **Tech stack.**

## Optional sections

- **Note on demo data** — when any part of the demo uses illustrative or synthetic data
  (a clinical knowledge base, a fabricated dataset), say so plainly, once, near the end.
  Kintwadi does this for its drug-interaction check.
- **Hackathon Disclosure** — an explicit required-stack compliance checklist ("Powered by
  Gemini… Built with Google Cloud Agent Builder…"), closing the README. **Optional, not
  universal**: Karma's rules named specific required technology to disclose and it
  carries this section; kintwadi's H0 rules didn't require the same disclosure shape and
  it has no equivalent section. Include it when `recon.json.tech.required` names specific
  technology the rules ask you to disclose using; skip it otherwise rather than padding a
  README that doesn't need it.

## What not to do

Don't lead with installation instructions or a badge wall. A judge skimming a gallery
decides whether to keep reading in the first screen -- installation steps belong in the
runbook (`demo-runbook`), not here.
