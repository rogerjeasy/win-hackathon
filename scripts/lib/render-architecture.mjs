/**
 * Renders docs/architecture.md from an architecture payload.
 *
 * Follows Kintwadi's proven section order (a project that won Best Design): title, a
 * one-line context bar, the thesis as a blockquote, a pointer to the three diagram sources,
 * the inline Mermaid diagram, the component legend (what it is / what it does / why this
 * choice — the design-scoring column), key request flows, invariants, the design system,
 * the system in one paragraph, and the diagram-export steps.
 *
 * Pure: no filesystem access. Sections whose payload fields are empty are omitted rather
 * than emitted as bare headings, except the component legend, which is never optional.
 */

import { layout } from './layout.mjs';
import { emitMermaid } from './emit-mermaid.mjs';

const has = (a) => Array.isArray(a) && a.length > 0;

export function renderArchitecture(architecture) {
  const a = architecture;
  const out = [];

  out.push('# Architecture');
  out.push('');

  const bar = a.context_bar ?? {};
  const parts = [
    bar.track && `**Track:** ${bar.track}`,
    bar.primary_database && `**Primary database:** ${bar.primary_database}`,
    bar.ai && `**AI:** ${bar.ai}`,
    bar.frontend && `**Frontend:** ${bar.frontend}`,
  ].filter(Boolean);
  if (parts.length > 0) {
    out.push(parts.join(' · '));
    out.push('');
  }

  out.push(`> ${a.thesis_line}`);
  out.push('');
  out.push('> Three diagram sources live in `docs/assets/`:');
  out.push('> `architecture.mmd` (the Mermaid source inlined below), `architecture.svg`');
  out.push('> (embeddable, converts to PNG with any tool), and `architecture.drawio`');
  out.push('> (editable at app.diagrams.net). All three are generated from');
  out.push('> `.hackathon/architecture.json`, so edit that and re-run `:architect` rather');
  out.push('> than editing a diagram by hand.');
  out.push('');
  out.push('---');
  out.push('');

  out.push('## Diagram');
  out.push('');
  out.push('```mermaid');
  out.push(emitMermaid(a, layout(a)).trimEnd());
  out.push('```');
  out.push('');

  out.push('## Component legend — *what it is* + *what it does* + *why this choice*');
  out.push('');
  out.push('| Component | What it is | What it does | Why this choice |');
  out.push('|---|---|---|---|');
  for (const c of a.components ?? []) {
    out.push(`| **${c.label}** | ${c.what_it_is} | ${c.what_it_does} | ${c.why_this_choice} |`);
  }
  out.push('');

  if (has(a.flows)) {
    out.push('## Key request flows');
    out.push('');
    for (const f of a.flows) {
      out.push(`### ${f.title}`);
      out.push('');
      for (const [i, step] of (f.steps ?? []).entries()) out.push(`${i + 1}. ${step}`);
      out.push('');
    }
  }

  if (has(a.invariants)) {
    out.push('## Invariants');
    out.push('');
    out.push('Non-negotiable for the life of the project. `AGENTS.md` carries the same list as');
    out.push('an agent contract.');
    out.push('');
    for (const [i, inv] of a.invariants.entries()) {
      out.push(`${i + 1}. ${inv.statement} — enforced by \`${inv.enforced_by}\`.`);
    }
    out.push('');
  }

  const ds = a.design_system;
  if (ds) {
    out.push('## Design system');
    out.push('');
    if (ds.personality) {
      out.push(`**Personality.** ${ds.personality}`);
      out.push('');
    }
    if (has(ds.anti_generic)) {
      out.push('**Anti-generic.** Deliberately avoided, because they are the default AI look:');
      out.push('');
      for (const rule of ds.anti_generic) out.push(`- ${rule}`);
      out.push('');
    }
    const tokens = ds.tokens ?? {};
    const keys = [...new Set([...Object.keys(tokens.light ?? {}), ...Object.keys(tokens.dark ?? {})])];
    if (keys.length > 0) {
      out.push('| Token | Light | Dark |');
      out.push('|---|---|---|');
      for (const k of keys) {
        out.push(`| ${k} | \`${tokens.light?.[k] ?? '—'}\` | \`${tokens.dark?.[k] ?? '—'}\` |`);
      }
      out.push('');
    }
    if (ds.type) {
      out.push(`**Type.** ${ds.type.ui} for UI, ${ds.type.display} for display. Base ` +
        `${ds.type.base_px}px; nothing meaningful below ${ds.type.min_meaningful_px}px.`);
      out.push('');
    }
    if (has(ds.breakpoints_px)) {
      out.push(`**Breakpoints.** ${ds.breakpoints_px.map((b) => `${b}px`).join(' · ')}`);
      out.push('');
    }
  }

  out.push('## The system in one paragraph');
  out.push('');
  out.push(onePara(a));
  out.push('');

  out.push('## Regenerating the diagram image');
  out.push('');
  out.push('The SVG is ready to embed as-is. For a PNG, or to edit the layout:');
  out.push('');
  out.push('1. Open **https://app.diagrams.net** → *Open Existing Diagram* → ' +
    '`docs/assets/architecture.drawio`.');
  out.push('2. **File → Export as → PNG** (Zoom 2x, border ~10) or **SVG**.');
  out.push('3. Hand edits are overwritten the next time `:architect` runs. To make a change');
  out.push('   stick, edit `.hackathon/architecture.json` and re-run it.');
  out.push('');

  return out.join('\n');
}

/** "A" · "A and B" · "A, B and C" */
function serial(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function onePara(a) {
  const tiers = [...new Set((a.components ?? []).map((c) => c.tier))].sort((x, y) => x - y);
  const tierComponents = tiers.map((t) => (a.components ?? []).filter((c) => c.tier === t));
  const rows = tierComponents.map((row) => serial(row.map((c) => c.label)));
  const counts = tierComponents.map((row) => row.length);

  let chain = '';
  if (rows.length === 1) {
    chain = `${rows[0]} ${counts[0] === 1 ? 'is' : 'are'} the whole system.`;
  } else if (rows.length > 1) {
    chain = `${rows[0]} ${counts[0] === 1 ? 'talks' : 'talk'} to ${rows[1]}`;
    for (let i = 2; i < rows.length; i++) {
      chain += `, which ${counts[i - 1] === 1 ? 'talks' : 'talk'} to ${rows[i]}`;
    }
    chain += '.';
  }

  const ac = a.access_control?.model === 'rls'
    ? ` Authorization is enforced in the database through row-level security, keyed on \`${a.access_control.session_context}\`.`
    : '';
  return `${chain}${ac} ${a.thesis_line}`.trim();
}
