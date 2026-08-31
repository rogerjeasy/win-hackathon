/**
 * README.md as a judge landing page (docs/design/m5-design.md §8, grounded in a fresh
 * read of kintwadi's and karma's real files): live-demo-link-first, the tech-thesis quote
 * as the first blockquote -- before any badges or results table -- security pointing at
 * AGENTS.md rather than restating it, an optional demo-data note, an optional Hackathon
 * Disclosure section.
 */
export function renderReadme(submission, { deploy, stack } = {}) {
  const r = submission.readme;
  const lines = [];
  lines.push(`# ${r.tagline.split(' ').slice(0, 6).join(' ')}`, '');
  const url = deploy?.primary_url;
  if (url) lines.push(`**Live demo:** ${url}`, '');
  lines.push(`> ${r.thesis_quote}`, '');
  lines.push(r.tagline, '');
  lines.push('## What it is', '', r.problem, '');
  lines.push('## Features', '');
  for (const f of r.features) lines.push(`- **${f.title}** — ${f.description}`);
  lines.push('');
  lines.push('## Security', '', `${r.security_summary} See [AGENTS.md](./AGENTS.md) for the full, enforced invariants.`, '');
  if (stack) {
    lines.push('## Tech stack', '');
    for (const slot of stack.slots ?? []) lines.push(`- **${slot.id}:** ${slot.choice}`);
    lines.push('');
  }
  if (r.demo_data_note) {
    lines.push('## Note on demo data', '', r.demo_data_note, '');
  }
  if (r.hackathon_disclosure) {
    lines.push('## Hackathon Disclosure', '');
    for (const c of r.hackathon_disclosure.required_stack) {
      lines.push(`- **${c.claim}** — ${c.evidence}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
