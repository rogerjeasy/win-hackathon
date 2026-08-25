/**
 * drawio (mxGraph XML) emitter — the editable source.
 *
 * The format is proven writable by hand: Kintwadi's Kintwadi-Architecture.drawio is a 20 KB
 * hand-authored file of exactly this shape. Generating it is bounded work, and it gives the
 * user something they can open in app.diagrams.net and adjust.
 */

const ZONE_STYLE = {
  public: 'rounded=1;fillColor=#FFFFFF;strokeColor=#5A6C72;fontColor=#1B231F;',
  authenticated: 'rounded=1;fillColor=#FFFFFF;strokeColor=#0F766E;strokeWidth=2;fontColor=#1B231F;',
  privileged: 'rounded=1;fillColor=#FFF7EC;strokeColor=#ED7100;strokeWidth=2;fontColor=#1B231F;',
  external: 'rounded=1;fillColor=#F5F5F5;strokeColor=#5A6C72;dashed=1;fontColor=#1B231F;',
  // A trust_zone that validateArchitecture would reject (unrecognised or missing) reaches
  // here only via a direct, unvalidated emitter call — see layout.mjs's precondition
  // comment. Falling back to `public` would silently understate a component's privilege,
  // which is worse than an odd-looking box, so this must be visibly its own thing: not a
  // shade of any real zone, and it must never throw. Kept consistent with the `unknown`
  // fallback in emit-mermaid.mjs and emit-svg.mjs.
  unknown: 'rounded=1;fillColor=#FEF2F2;strokeColor=#B91C1C;dashed=1;fontColor=#7F1D1D;',
};

const BOUNDARY_STYLE =
  'rounded=1;fillColor=none;strokeColor=#94A3C4;dashed=1;verticalAlign=top;align=left;' +
  'spacingLeft=8;spacingTop=4;fontColor=#5A6C72;fontSize=12;';

const EDGE_STYLE =
  'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#5A6C72;fontColor=#6B716C;fontSize=11;';

/** XML escaping — must be lossless (unlike Mermaid's character substitution), and must cover
 *  the double quote, since labels live inside a value="…" attribute here. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function emitDrawio(architecture, laidOut) {
  const { canvas, boxes, edges, boundaries } = laidOut;
  const pageWidth = Math.max(canvas.width, 850);
  const pageHeight = Math.max(canvas.height, 1100);

  const out = [];
  out.push('<mxfile host="app.diagrams.net" agent="win-hackathon" version="24.0.0">');
  out.push('  <diagram id="architecture" name="Architecture">');
  out.push(
    `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" ` +
    `connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" ` +
    `pageHeight="${pageHeight}" math="0" shadow="0">`,
  );
  out.push('      <root>');
  out.push('        <mxCell id="0" />');
  out.push('        <mxCell id="1" parent="0" />');

  // Boundaries first so they sit beneath the boxes in z-order, as in the Kintwadi source.
  for (const b of boundaries) {
    out.push(
      `        <mxCell id="${esc(b.id)}" value="${esc(b.label)}" style="${BOUNDARY_STYLE}" vertex="1" parent="1">`,
    );
    out.push(`          <mxGeometry x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" as="geometry" />`);
    out.push('        </mxCell>');
  }

  for (const box of boxes) {
    const style = ZONE_STYLE[box.zone] ?? ZONE_STYLE.unknown;
    out.push(
      `        <mxCell id="${esc(box.id)}" value="${esc(box.label)}" style="${style}" vertex="1" parent="1">`,
    );
    out.push(`          <mxGeometry x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" as="geometry" />`);
    out.push('        </mxCell>');
  }

  for (const [i, e] of edges.entries()) {
    out.push(
      `        <mxCell id="edge-${i}" value="${esc(e.label)}" style="${EDGE_STYLE}" edge="1" ` +
      `parent="1" source="${esc(e.from)}" target="${esc(e.to)}">`,
    );
    out.push('          <mxGeometry relative="1" as="geometry" />');
    out.push('        </mxCell>');
  }

  out.push('      </root>');
  out.push('    </mxGraphModel>');
  out.push('  </diagram>');
  out.push('</mxfile>');
  return `${out.join('\n')}\n`;
}
