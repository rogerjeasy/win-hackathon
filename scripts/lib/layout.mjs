/**
 * Tiered layout. Tiers are rows, components are evenly spaced within a row, edges run
 * downward between tier bands, and a trust boundary becomes a rectangle enclosing the
 * bounding box of its members.
 *
 * Deliberately naive: no force-directed placement, no crossing minimisation. The corpus
 * diagrams are all simple tiered pictures, and a layout algorithm nobody can test is worth
 * less than a plain one everybody can.
 *
 * Pure: no filesystem access, no mutation of the input.
 */

export const LAYOUT = {
  BOX_W: 200,
  BOX_H: 80,
  GAP_X: 40,
  GAP_Y: 70,
  PAD: 40,
  BOUNDARY_PAD: 18,
};

/**
 * Precondition: `architecture` must already have passed `validateArchitecture()`. This
 * function does no validation of its own, and two malformed shapes it does not catch:
 *   - a duplicate `components[].id`: `byId` below is keyed by id, so the later component
 *     silently overwrites the earlier one and an edge or trust boundary that meant to
 *     reference the first one is laid out against the second instead — no error, wrong
 *     picture.
 *   - an edge endpoint that names no declared component: `byId.get(e.from/e.to)` returns
 *     `undefined`, and reading `.x`/`.w`/etc. off it throws a generic `TypeError`, not a
 *     message that names the bad edge.
 * The three emitters (emit-mermaid.mjs, emit-svg.mjs, emit-drawio.mjs) call this directly,
 * so they inherit both failure modes on unvalidated input.
 */
export function layout(architecture) {
  const components = [...(architecture?.components ?? [])];

  const tiers = [...new Set(components.map((c) => c.tier))].sort((a, b) => a - b);
  const rows = tiers.map((t) => components.filter((c) => c.tier === t));

  const widest = Math.max(1, ...rows.map((r) => r.length));
  const contentW = widest * LAYOUT.BOX_W + (widest - 1) * LAYOUT.GAP_X;
  const width = contentW + LAYOUT.PAD * 2;
  const height = rows.length * LAYOUT.BOX_H + (rows.length - 1) * LAYOUT.GAP_Y + LAYOUT.PAD * 2;

  const boxes = [];
  rows.forEach((row, rowIndex) => {
    const rowW = row.length * LAYOUT.BOX_W + (row.length - 1) * LAYOUT.GAP_X;
    const startX = (width - rowW) / 2;          // centre each row on the canvas
    const y = LAYOUT.PAD + rowIndex * (LAYOUT.BOX_H + LAYOUT.GAP_Y);
    row.forEach((c, colIndex) => {
      boxes.push({
        id: c.id,
        label: c.label,
        zone: c.trust_zone,
        tier: c.tier,
        x: startX + colIndex * (LAYOUT.BOX_W + LAYOUT.GAP_X),
        y,
        w: LAYOUT.BOX_W,
        h: LAYOUT.BOX_H,
      });
    });
  });

  const byId = new Map(boxes.map((b) => [b.id, b]));

  const edges = (architecture?.edges ?? []).map((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    return {
      from: e.from,
      to: e.to,
      label: e.label ?? '',
      x1: from.x + from.w / 2,
      y1: from.y + from.h,
      x2: to.x + to.w / 2,
      y2: to.y,
    };
  });

  const boundaries = (architecture?.trust_boundaries ?? []).map((b) => {
    const members = b.contains.map((id) => byId.get(id));
    const minX = Math.min(...members.map((m) => m.x));
    const minY = Math.min(...members.map((m) => m.y));
    const maxX = Math.max(...members.map((m) => m.x + m.w));
    const maxY = Math.max(...members.map((m) => m.y + m.h));
    return {
      id: b.id,
      label: b.label,
      x: minX - LAYOUT.BOUNDARY_PAD,
      y: minY - LAYOUT.BOUNDARY_PAD,
      w: maxX - minX + LAYOUT.BOUNDARY_PAD * 2,
      h: maxY - minY + LAYOUT.BOUNDARY_PAD * 2,
    };
  });

  return { canvas: { width, height }, boxes, edges, boundaries };
}
