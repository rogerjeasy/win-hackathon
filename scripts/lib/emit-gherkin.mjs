/**
 * Gherkin emitter. One .feature file per feature, rendered from the structured scenarios in
 * requirements.json so the Gherkin and the FR table cannot drift.
 */

const INDENT = '  ';

function steps(keyword, lines) {
  return (lines ?? []).map((l, i) => `${INDENT}${INDENT}${i === 0 ? keyword : 'And'} ${l}`);
}

export function emitGherkin(feature) {
  const out = [];
  out.push(`Feature: ${feature.title}`);
  out.push(`${INDENT}As a ${feature.user_story.as_a}`);
  out.push(`${INDENT}I want ${feature.user_story.i_want}`);
  out.push(`${INDENT}So that ${feature.user_story.so_that}`);
  out.push('');

  for (const s of feature.scenarios ?? []) {
    if ((s.tags ?? []).length > 0) out.push(`${INDENT}${s.tags.join(' ')}`);
    out.push(`${INDENT}Scenario: ${s.name}`);
    // The FR id travels with the scenario so a failing test points at the requirement
    // it was written to prove, not just at a line number.
    out.push(`${INDENT}${INDENT}# ${s.id} — satisfies ${s.requirement_ref}`);
    out.push(...steps('Given', s.given));
    out.push(...steps('When', s.when));
    out.push(...steps('Then', s.then));
    out.push('');
  }

  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

export function emitAllGherkin(requirements) {
  const files = new Map();
  for (const f of requirements.features ?? []) files.set(f.slug, emitGherkin(f));
  return files;
}
