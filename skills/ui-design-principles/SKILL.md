---
name: ui-design-principles
description: Use at :architect — the design system distilled from 01-design-system.md, the prompt behind Kintwadi's Best Design win, fixed once before the first screen and reused for every screen after.
---

# The system is a decision, not a vibe

`01-design-system.md` is the first of Kintwadi's sixteen numbered v0 prompts
(`01-design-system.md` through `16-role-scoped-views.md`), and it is the only one that
doesn't produce a product screen — it produces the *rules* every later screen has to obey.
Everything below is distilled from that prompt, the one behind the Best Design win at H0:
Hack the Zero Stack.

## Tokens, not hex

Color, spacing, and radius are installed as CSS variables and referenced by semantic name —
`background`, `foreground`, `primary`, `accent`, `muted`, `border`, `ring`, `success`,
`warning`, `danger`, `info` — never as a raw hex value typed into a component. A component
that reads `bg-primary` instead of `bg-[#0F766E]` doesn't just look neater; it means a
palette change, a dark-mode swap, or a rebrand touches one token file instead of every
component that happened to hardcode a color. If you can `grep` a component file for `#` and
find a hex code, the token layer has already leaked.

## Light and dark are both designed

The prompt specifies a full second palette for dark mode — different background, different
card surface, a brightened `primary` (`#14B8A6` instead of `#0F766E`) so it still reads at
the right contrast against a dark ground — not a CSS filter or an automatic darkening of the
light values. A derived dark mode (invert, or run everything through a lightness transform)
reliably produces muddy surfaces and blown-out accents; a designed one gets a card color,
a border color, and an accent that were each chosen to work together at that specific
darkness, the same way the light palette was.

## The anti-generic list

This is the list that separates a designed interface from a generated-looking one, and it's
worth carrying verbatim rather than paraphrased, because the paraphrase is exactly what
produces the look it's warning against:

> ANTI-GENERIC (avoid the default AI look) — NO purple/indigo gradients, NO neon, NO
> glassmorphism everywhere, NO emoji as UI icons, NO cramped dashboards. Avoid pure #000 on
> #FFF. Use the warm palette below with intention and restraint. Color is an accent, not
> wallpaper.

Every item on that list is a default some model or template reaches for when nothing else
has been decided — a purple-to-indigo gradient hero, a neon accent glow, blurred
glass-panel cards stacked everywhere, an emoji standing in for an icon nobody designed, pure
black text on pure white. None of them are wrong in isolation; the list exists because
*all of them together, by default*, is the visual signature of a UI nobody made a decision
about. Naming them explicitly is what makes a designer (or a model) reach for something
else instead.

## Type: one display face, a 16px floor

UI and body copy use one workhorse font (Inter, for broad multilingual coverage) at a
16px base with roughly 1.6 line-height for readability. A separate display/serif face
(Fraunces, in Kintwadi's system) is reserved for large emotional headlines on
marketing and auth surfaces only — in-app headings stay in the UI face, semibold, tight
tracking. The type scale never drops below **14px for meaningful text**, and in-app body
text stays at 16px or larger — the floor exists because a caption-sized font that reads
fine on a designer's laptop is often the line an actual user can't read at all.

## Breakpoints: four real viewport classes

Design and verify against four explicit widths: **375** (phone browser), **820** (tablet
portrait), **1024** (tablet landscape / laptop), and **1440** (desktop) — flawless from
320px up to 4K, zero horizontal scroll, zero overflow, zero overlapping elements at any of
them. The tablet width is not a scaled-up phone layout or a scaled-down desktop one — it
gets a genuine intermediate layout (a two-column arrangement, a collapsed icon rail), and
multi-column grids fold step by step (four columns to two to one) rather than collapsing
straight from desktop to phone in one jump. A tablet screenshot that's obviously "the phone
layout, wider" is a breakpoint that wasn't actually designed.

## Accessibility and motion

WCAG AA contrast and visible focus rings on every interactive element, 44px minimum touch
targets, status conveyed by icon *and* text *and* color together (never color alone) so the
interface still communicates for a colorblind user or a grayscale screenshot. Motion is
purposeful and quick (150–250ms, ease-out) and every animated interaction must honor
`prefers-reduced-motion` by swapping movement for an instant, opacity-only transition — an
interface that ignores that media query isn't accessible no matter how soft its shadows are.

## Realistic copy, never lorem

Every screen ships with copy that sounds like the product talking to its actual user —
"All meds given today," not "0 errors"; a real name in a real card, not `Lorem ipsum` or
`User 1`. Placeholder text reads as a placeholder; it hides layout problems (text that's too
long, labels that don't fit, a tone that doesn't match the brand) that only show up once real
words go in. If the copy in a mock is lorem, the screen hasn't actually been designed yet —
it's been laid out, which is a different, earlier step.

## Components decomposed, not page-sized

A screen is built from named, reusable pieces — `Card`, `Badge`, `Avatar`, `Tabs`, a form
built on `react-hook-form` + `zod` — not one component that renders the whole page inline.
Decomposition is what makes the system reusable at all: a `GhostCard` or a `ContractSparkline`
built once gets used everywhere it's needed, and a change to how badges look happens in one
file instead of in every screen that drew its own badge. A page-sized component is a system
of one, used once, that has to be re-derived — or copy-pasted and drifted — the next time a
similar screen is needed.

## Fix the system once, before the first screen

This is the rule that made the other fifteen prompts work. `01-design-system.md` runs
*first*, before any screen exists, and establishes tokens, type, spacing, breakpoints, motion
and accessibility rules as a single reference the model is told to reuse: "Establish this
design system and reuse it for every screen I ask for next." Every later prompt — the
dashboard, the timeline, the documents view, all the way through role-scoped views — inherits
that system instead of re-deciding color and type from scratch. That's the concrete
difference between sixteen screens that read as one product and sixteen screens that each
look like a different app: fix the system once, before the first screen, and reuse it for
every screen after.
