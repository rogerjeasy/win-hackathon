const DEFAULT_NAME = 'win-hackathon';

export function markersFor(name = DEFAULT_NAME) {
  return { BEGIN: `<!-- BEGIN:${name} -->`, END: `<!-- END:${name} -->` };
}

export const { BEGIN, END } = markersFor();

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockRe(name) {
  const { BEGIN: b, END: e } = markersFor(name);
  return new RegExp(`${escapeRe(b)}\\n?([\\s\\S]*?)\\n?${escapeRe(e)}`);
}

export function hasBlock(content, name = DEFAULT_NAME) {
  return blockRe(name).test(content);
}

export function readBlock(content, name = DEFAULT_NAME) {
  const m = content.match(blockRe(name));
  return m ? m[1] : null;
}

function countOccurrences(content, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = content.indexOf(needle, from);
    if (i === -1) return count;
    count += 1;
    from = i + needle.length;
  }
}

// Detects a marker that is present but not cleanly paired: an unclosed BEGIN, an
// END with no matching BEGIN, or (the two-write regression) a BEGIN/END count that
// only balances because a later write appended its own well-formed pair alongside an
// earlier orphan. blockRe alone cannot see this — it is non-global and lazy, so it
// happily matches from the *first* BEGIN to the *nearest* END even when a stray BEGIN
// sits in between, silently swallowing everything the user wrote there.
function findOrphan(content, name) {
  const { BEGIN: b, END: e } = markersFor(name);
  const beginCount = countOccurrences(content, b);
  const endCount = countOccurrences(content, e);
  if (beginCount === 0 && endCount === 0) return null;
  if (beginCount > endCount) return { b, e, kind: 'unclosed-begin' };
  if (endCount > beginCount) return { b, e, kind: 'orphaned-end' };

  // Counts balance; confirm every BEGIN is followed, in order, by its own END —
  // guards against out-of-order or overlapping markers that happen to count even.
  let from = 0;
  for (let i = 0; i < beginCount; i += 1) {
    const bi = content.indexOf(b, from);
    const ei = content.indexOf(e, bi + b.length);
    if (bi === -1 || ei === -1) return { b, e, kind: 'malformed' };
    from = ei + e.length;
  }
  return null;
}

function orphanMessage({ b, e, kind }) {
  if (kind === 'orphaned-end') {
    return (
      `refusing to write: content has an ${e} marker with no matching ${b}. ` +
      `Close or remove it by hand first — writing here risks destroying everything ` +
      `around that marker.`
    );
  }
  if (kind === 'malformed') {
    return (
      `refusing to write: content has ${b} / ${e} markers that are out of order or ` +
      `overlapping, not a clean pair. Fix them by hand first — writing here risks ` +
      `destroying everything between them.`
    );
  }
  return (
    `refusing to write: content has an unclosed ${b} marker with no ` +
    `matching ${e}. Close or remove it by hand first — writing here risks ` +
    `destroying everything between that marker and the next end marker.`
  );
}

export function upsertBlock(content, body, name = DEFAULT_NAME) {
  const { BEGIN: b, END: e } = markersFor(name);
  const orphan = findOrphan(content, name);
  if (orphan) {
    throw new Error(orphanMessage(orphan));
  }
  if (body.includes(b) || body.includes(e)) {
    throw new Error(`body must not contain marker strings BEGIN or END (${b}, ${e})`);
  }
  const block = `${b}\n${body}\n${e}`;
  if (hasBlock(content, name)) {
    return content.replace(blockRe(name), () => block);
  }
  if (content.trim() === '') return `${block}\n`;
  return `${content.replace(/\n+$/, '')}\n\n${block}\n`;
}

export function isFullyManaged(content, name = DEFAULT_NAME) {
  const { BEGIN: b, END: e } = markersFor(name);
  const trimmed = content.trim();
  return trimmed.startsWith(b) && trimmed.endsWith(e);
}
