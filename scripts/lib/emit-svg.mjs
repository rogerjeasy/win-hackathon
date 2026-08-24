/**
 * Standalone SVG emitter. Self-contained by contract: no external fonts, no scripts, no
 * remote images. This is the file the README embeds and the one that converts to PNG with
 * any tool the user already has — which is why the plugin ships no PNG renderer.
 */

const ZONE_FILL = {
  public: '#FFFFFF',
  authenticated: '#FFFFFF',
  privileged: '#FFF7EC',
  external: '#F5F5F5',
};
const ZONE_STROKE = {
  public: '#5A6C72',
  authenticated: '#0F766E',
  privileged: '#ED7100',
  external: '#5A6C72',
};

const FONT = 'system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif';
const CHARS_PER_LINE = 24;

/** XML escaping — must be lossless (unlike Mermaid's character substitution). */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Greedy word wrap. Boxes are a fixed width, so a long label must break, not overflow. */
function wrap(label, max = CHARS_PER_LINE) {
  const words = String(label ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if (`${line} ${w}`.length <= max) line = `${line} ${w}`;
    else { lines.push(line); line = w; }
  }
  if (line !== '') lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export function emitSvg(architecture, laidOut) {
  const { canvas, boxes, edges, boundaries } = laidOut;
  const out = [];

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" ` +
    `viewBox="0 0 ${canvas.width} ${canvas.height}" font-family="${FONT}">`,
  );

  out.push('  <defs>');
  out.push('    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ' +
           'markerHeight="7" orient="auto-start-reverse">');
  out.push('      <path d="M 0 0 L 10 5 L 0 10 z" fill="#5A6C72"/>');
  out.push('    </marker>');
  out.push('  </defs>');

  out.push(`  <rect x="0" y="0" width="${canvas.width}" height="${canvas.height}" fill="#FFFFFF"/>`);

  // Boundaries first — they are the backdrop. Painted after the boxes they would hide them.
  for (const b of boundaries) {
    out.push(
      `  <rect class="boundary" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" ` +
      'fill="none" stroke="#94A3C4" stroke-width="1.5" stroke-dasharray="6 4"/>',
    );
    out.push(
      `  <text class="boundary-label" x="${b.x + 8}" y="${b.y - 6}" font-size="12" ` +
      `fill="#5A6C72">${esc(b.label)}</text>`,
    );
  }

  for (const e of edges) {
    out.push(
      `  <line class="edge" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" ` +
      'stroke="#5A6C72" stroke-width="1.5" marker-end="url(#arrow)"/>',
    );
    if (e.label) {
      const mx = (e.x1 + e.x2) / 2;
      const my = (e.y1 + e.y2) / 2;
      out.push(
        `  <text class="edge-label" x="${mx + 6}" y="${my - 4}" font-size="11" ` +
        `fill="#6B716C">${esc(e.label)}</text>`,
      );
    }
  }

  for (const b of boxes) {
    out.push(
      `  <rect class="box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" ` +
      `fill="${ZONE_FILL[b.zone] ?? '#FFFFFF'}" stroke="${ZONE_STROKE[b.zone] ?? '#5A6C72'}" ` +
      'stroke-width="1.5"/>',
    );
    const lines = wrap(b.label);
    const startY = b.y + b.h / 2 - ((lines.length - 1) * 16) / 2 + 5;
    out.push(`  <text x="${b.x + b.w / 2}" y="${startY}" text-anchor="middle" font-size="13" fill="#1B231F">`);
    for (const [i, line] of lines.entries()) {
      out.push(`    <tspan x="${b.x + b.w / 2}" dy="${i === 0 ? 0 : 16}">${esc(line)}</tspan>`);
    }
    out.push('  </text>');
  }

  out.push('</svg>');
  return `${out.join('\n')}\n`;
}
