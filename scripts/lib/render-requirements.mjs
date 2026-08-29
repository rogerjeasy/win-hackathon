/**
 * Renders docs/requirements.md from a requirements payload, optionally an architecture payload.
 *
 * Follows Cassandra's shape: component inventory -> functional requirements by feature ->
 * non-functional -> acceptance criteria as a Definition of Done -> test matrix.
 *
 * Pure: no filesystem access. Every table is built through renderTable() so free-text fields
 * (statements, rules) can never contain a stray '|' that shifts a judge-facing table's columns,
 * and an empty table collapses to nothing rather than a headerless husk.
 */

import { renderTable } from './render.mjs';

const PRIORITY_ORDER = { must: 0, should: 1, wont: 2 };

function ordered(features) {
  return [...features].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  );
}

export function renderRequirements(requirements, architecture) {
  const features = ordered(requirements.features ?? []);
  const out = [];

  out.push('# Requirements');
  out.push('');
  out.push('Every requirement below carries an id, and every must-have carries at least one');
  out.push('scenario. The scenarios are the acceptance tests the build has to satisfy.');
  out.push('');

  out.push('## Criteria coverage');
  out.push('');
  const criteria = [...new Set(features.flatMap((f) => f.criterion_refs ?? []))];
  const coverageRows = criteria.map((c) => {
    const claimants = features.filter((f) => (f.criterion_refs ?? []).includes(c));
    return [`\`${c}\``, claimants.map((f) => `${f.id} (${f.priority})`).join(', ')];
  });
  const coverageTable = renderTable(['Criterion', 'Claimed by'], coverageRows);
  if (coverageTable) {
    out.push(coverageTable);
    out.push('');
  }

  out.push('## Component inventory');
  out.push('');
  const labels = new Map((architecture?.components ?? []).map((c) => [c.id, c.label]));
  const inventoryRows = features.map((f) => {
    // The raw component id stays in the cell (not just the friendlier label) — it is the
    // identifier that ties this row back to architecture.json's component list.
    const comps = (f.component_refs ?? [])
      .map((id) => (labels.has(id) ? `\`${id}\` ${labels.get(id)}` : `\`${id}\``))
      .join(', ');
    return [`**${f.id}** ${f.title}`, f.priority, comps, f.demo_moment ? 'yes' : '—'];
  });
  out.push(renderTable(['Feature', 'Priority', 'Components', 'Demo moment'], inventoryRows));
  out.push('');

  out.push('## Functional requirements');
  out.push('');
  for (const f of features) {
    out.push(`### ${f.id} — ${f.title} *(${f.priority})*`);
    out.push('');
    out.push(`As a ${f.user_story.as_a}, I want ${f.user_story.i_want}, so that ${f.user_story.so_that}.`);
    out.push('');
    for (const r of f.requirements ?? []) {
      const inv = (r.invariant_refs ?? []).length > 0
        ? ` *(upholds ${r.invariant_refs.join(', ')})*` : '';
      out.push(`- **${r.id}** — ${r.statement}${inv}`);
    }
    out.push('');
  }

  const nfrs = requirements.non_functional ?? [];
  if (nfrs.length > 0) {
    out.push('## Non-functional requirements');
    out.push('');
    const nfrRows = nfrs.map((n) => [`**${n.id}**`, n.statement, n.verify]);
    out.push(renderTable(['Id', 'Requirement', 'How it is verified'], nfrRows));
    out.push('');
  }

  out.push('## Acceptance criteria — Definition of Done');
  out.push('');
  out.push('A feature is done when every line below is true and demonstrable. Not "implemented" —');
  out.push('demonstrable.');
  out.push('');
  for (const f of features) {
    for (const r of f.requirements ?? []) {
      const scenarios = (f.scenarios ?? []).filter((s) => s.requirement_ref === r.id);
      const proof = scenarios.length > 0
        ? scenarios.map((s) => s.id).join(', ')
        : 'no scenario — not demonstrable';
      out.push(`- [ ] **${r.id}** ${r.statement} — proven by ${proof}`);
    }
  }
  out.push('');

  out.push('## Test matrix');
  out.push('');
  const matrixRows = features.flatMap((f) =>
    (f.scenarios ?? []).map((s) => [
      `\`${s.id}\` ${s.name}`,
      f.id,
      s.requirement_ref,
      (f.criterion_refs ?? []).join(', '),
      (s.tags ?? []).join(' '),
    ]));
  out.push(renderTable(['Scenario', 'Feature', 'Satisfies', 'Criteria', 'Tags'], matrixRows));
  out.push('');

  return out.join('\n');
}
