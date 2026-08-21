export const BEGIN = '<!-- BEGIN:win-hackathon -->';
export const END = '<!-- END:win-hackathon -->';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_RE = new RegExp(`${escapeRe(BEGIN)}\\n?([\\s\\S]*?)\\n?${escapeRe(END)}`);

export function hasBlock(content) {
  return BLOCK_RE.test(content);
}

export function readBlock(content) {
  const m = content.match(BLOCK_RE);
  return m ? m[1] : null;
}

export function upsertBlock(content, body) {
  const block = `${BEGIN}\n${body}\n${END}`;
  if (hasBlock(content)) {
    return content.replace(BLOCK_RE, () => block);
  }
  if (content.trim() === '') return `${block}\n`;
  return `${content.replace(/\n+$/, '')}\n\n${block}\n`;
}

export function isFullyManaged(content) {
  const trimmed = content.trim();
  return trimmed.startsWith(BEGIN) && trimmed.endsWith(END);
}
