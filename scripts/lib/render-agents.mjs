import { upsertBlock } from './markers.mjs';

const DRIFT_MARKER = 'nextjs-agent-rules';

/**
 * The framework-drift banner. Kintwadi and Sonar — two unrelated winning projects — ship
 * this text byte-identical under this exact marker name. The wording is canonical; only
 * the package name and docs path vary. Do not paraphrase it.
 */
export function renderDriftBanner(stack) {
  const pins = stack?.bleeding_edge ?? [];
  if (pins.length === 0) return null;

  const blocks = pins.map((pin) => {
    const name = properName(pin.package);
    return [
      `# This is NOT the ${name} you know`,
      '',
      `This version has breaking changes — APIs, conventions, and file structure may all differ ` +
        `from your training data. Read the relevant guide in \`${pin.docs_path ?? 'the vendored docs'}\` ` +
        `before writing any code. Heed deprecation notices.`,
    ].join('\n');
  });
  return blocks.join('\n\n');
}

function properName(pkg) {
  const known = { next: 'Next.js', react: 'React', fastapi: 'FastAPI', tailwindcss: 'Tailwind CSS' };
  return known[String(pkg).toLowerCase()] ?? pkg;
}

/**
 * The numbered invariants contract. Empty when the project has none — a short AGENTS.md is
 * a legitimate output, not a failure. Sonar won first place with the banner alone, so this
 * must never pad the list with invented rules.
 */
export function renderInvariants(architecture) {
  const invariants = architecture?.invariants ?? [];
  if (invariants.length === 0) return '';

  const out = [];
  out.push('# 🔒 Security invariants — ALWAYS enforce these (non-negotiable, for the entire project)');
  out.push('');
  out.push('These are defense-in-depth and fail-closed. Never weaken any layer.');
  out.push('');
  for (const [i, inv] of invariants.entries()) {
    out.push(`${i + 1}. **${inv.statement}** Enforced by \`${inv.enforced_by}\`.`);
  }
  out.push('');
  out.push('If a change would bypass any of the above, stop and flag it instead of shipping it.');
  return out.join('\n');
}

export function renderAgentsMd(existing, architecture, stack) {
  let content = existing ?? '';

  const banner = renderDriftBanner(stack);
  if (banner !== null) content = upsertBlock(content, banner, DRIFT_MARKER);

  const invariants = renderInvariants(architecture);
  if (invariants !== '') content = upsertBlock(content, invariants);

  return content;
}

/** CLAUDE.md is a pointer, not a copy. Never replace a file that already has content. */
export function renderClaudeMd(existing) {
  const content = existing ?? '';
  if (/^\s*@AGENTS\.md\s*$/m.test(content)) return content;
  if (content.trim() === '') return '@AGENTS.md\n';
  return `${content.replace(/\n+$/, '')}\n\n@AGENTS.md\n`;
}
