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

export function upsertBlock(content, body, name = DEFAULT_NAME) {
  const { BEGIN: b, END: e } = markersFor(name);
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
