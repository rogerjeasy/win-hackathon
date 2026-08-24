---
name: architecture-diagramming
description: Use at :architect — what judges actually read in an architecture diagram, and the tier model the three emitters render from.
---

# What a diagram is for

A judge spends seconds on the diagram, not minutes. It has one job: let them place the system
before they read a word of prose. Everything below is either evidence for how the corpus
actually drew that picture, or the model this plugin's three emitters render it from.

## The corpus

Five winning projects, five different diagramming approaches — no two the same:

| Project | Approach |
|---|---|
| Kintwadi (Best Design) | `.drawio` source, an inline Mermaid diagram in `docs/architecture.md`, and a manually-exported `.png` |
| Sonar (1st, Million-scale Global) | Inline SVG hand-authored inside a Python script, `generate_pdf.py`, rendered to PDF |
| HYPE (Best Technical Implementation) | `.svg` |
| Relay (Most Impactful) | `.svg` plus a separately shipped `.png` |
| Karma (Second Place, Dynatrace) | ASCII box art, drawn directly in `docs/ARCHITECTURE.md` |

**No project in the corpus automated a drawio-to-PNG export.** Kintwadi's `.png` — the only
one in the corpus documented as coming from a drawio source — was made by hand: someone opened
the drawio file in app.diagrams.net and clicked Export. Relay shipped a separate `.png` too,
but not by way of drawio at all. Every other project skipped raster entirely and committed a
hand-authored SVG or ASCII format directly. Nothing in the corpus runs a headless renderer, and
this plugin doesn't either: it emits Mermaid and SVG, which cover every case a PNG would, and
leaves the export step manual exactly where Kintwadi left it.

## The tier model

`architecture.json` holds components with an integer `tier`, edges between component ids, and
trust boundaries that name which components they enclose. A layout pass turns that into rows:

- **Tiers are rows.** Every component at tier 1 sits in the top row, tier 2 the next row down,
  and so on — there is no per-component x/y to choose, only which row a component belongs in.
- **Edges flow downward**, from a box in one tier to a box in the tier below. An edge that
  needs to point sideways or upward is a sign the component was put in the wrong tier, not a
  layout case to special-case.
- **A tier of a dozen components is a modelling problem, not a layout problem.** No amount of
  spacing, wrapping, or crossing-minimisation makes twelve boxes in one row readable. The fix
  is to split that tier into two — a service tier and a supporting-infra tier, say — so the
  diagram states a decision about the system instead of hiding one.

This is deliberately simpler than a force-directed layout: the corpus diagrams are all plain
tiered pictures — Kintwadi's hand-drawn `.drawio` has no crossing-minimisation either — and a
layout algorithm nobody can hand-verify is worth less than a plain one everybody can.

**Trust boundaries render as dashed enclosures.** Each boundary becomes a dashed rectangle
sized to the bounding box of the components it contains — public internet outside the box,
authenticated or privileged zones inside it — so the enclosure is the one piece of the picture
that says where a request stops being anonymous.

## What judges read

In the seconds a judge actually spends on the picture, three things register: **the trust
boundary** (what's exposed versus what's behind auth), **where data crosses it** (which edge
is the one write or read that matters), and **which box is the thesis** — the one component
that, if you deleted it, would make the sponsor-tech thesis untrue. A diagram that shows every
box at equal visual weight makes a judge do the ranking themselves; a diagram that makes the
thesis component obviously central does the judge's ranking for them.

## Regenerating, not hand-editing

Diagrams in this plugin are **generated from `architecture.json`** — `layout.mjs` turns the
tiered graph into positioned boxes and routed edges, and three emitters (Mermaid, SVG, drawio)
render that one laid-out graph into three files. A hand edit to `architecture.mmd`,
`architecture.svg`, or `architecture.drawio` is lost the next time `:architect` runs, because
the run overwrites all three from the payload again. To make a change stick, edit
`architecture.json` and re-run `:architect` — never the rendered file directly.
