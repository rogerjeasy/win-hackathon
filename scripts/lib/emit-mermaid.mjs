/**
 * Mermaid emitter. This is the diagram that always renders — GitHub, every Markdown
 * preview — so it is the one inlined into docs/architecture.md.
 *
 * Mermaid runs its own layout, so the geometry from layout() is used only for node
 * ORDER (tier order top to bottom). Coordinates are ignored on purpose.
 */

const ZONE_STYLE = {
  public: 'fill:#FFFFFF,stroke:#5A6C72,color:#232F3E',
  authenticated: 'fill:#FFFFFF,stroke:#0F766E,stroke-width:2px,color:#232F3E',
  privileged: 'fill:#FFF7EC,stroke:#ED7100,stroke-width:2px,color:#232F3E',
  external: 'fill:#F5F5F5,stroke:#5A6C72,stroke-dasharray:3 3,color:#232F3E',
};

/** Mermaid node labels break on quotes, square brackets and pipes. */
function esc(s) {
  return String(s ?? '')
    .replace(/"/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\|/g, '/');
}

export function emitMermaid(architecture, laidOut) {
  const out = ['flowchart TB'];

  const zones = [...new Set((architecture.components ?? []).map((c) => c.trust_zone))];
  for (const z of zones) {
    out.push(`  classDef ${z} ${ZONE_STYLE[z] ?? ZONE_STYLE.public};`);
  }

  const ordered = [...laidOut.boxes].sort((a, b) => (a.tier - b.tier) || (a.x - b.x));
  const inBoundary = new Map();
  for (const b of architecture.trust_boundaries ?? []) {
    for (const id of b.contains) inBoundary.set(id, b.id);
  }

  // Nodes outside any boundary first, in tier order, then one subgraph per boundary.
  for (const box of ordered) {
    if (inBoundary.has(box.id)) continue;
    out.push(`  ${box.id}[${esc(box.label)}]`);
  }
  for (const b of architecture.trust_boundaries ?? []) {
    out.push(`  subgraph ${b.id}[${esc(b.label)}]`);
    for (const box of ordered) {
      if (inBoundary.get(box.id) !== b.id) continue;
      out.push(`    ${box.id}[${esc(box.label)}]`);
    }
    out.push('  end');
  }

  for (const e of architecture.edges ?? []) {
    out.push(e.label ? `  ${e.from} -->|${esc(e.label)}| ${e.to}` : `  ${e.from} --> ${e.to}`);
  }

  for (const z of zones) {
    const members = (architecture.components ?? []).filter((c) => c.trust_zone === z).map((c) => c.id);
    if (members.length > 0) out.push(`  class ${members.join(',')} ${z};`);
  }

  return `${out.join('\n')}\n`;
}
