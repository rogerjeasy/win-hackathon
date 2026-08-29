/**
 * Kiro spec triad — requirements.md / design.md / tasks.md per must-have feature.
 *
 * The shape comes from Relay (.kiro/specs/relay-h0-mvp/) and Project Memoria
 * (docs/specs/NNNN-feature/), two winning repositories that practised spec-driven
 * development. Both wrote theirs by hand; these are generated from requirements.json so
 * they cannot drift from the FR table or the Gherkin.
 */

/** EARS: WHILE <precondition>, WHEN <trigger>, THE SYSTEM SHALL <response>. */
export function toEars(scenario) {
  const clauses = [];
  const given = (scenario.given ?? []).join(' and ');
  const when = (scenario.when ?? []).join(' and ');
  const then = (scenario.then ?? []).join(' and ');
  if (given !== '') clauses.push(`WHILE ${given}`);
  if (when !== '') clauses.push(`WHEN ${when}`);
  clauses.push(`THE SYSTEM SHALL ${then}`);
  return `${clauses.join(', ')}.`;
}

const pad = (n) => String(n).padStart(4, '0');

export function emitKiro(requirements, architecture) {
  const out = new Map();
  const musts = (requirements.features ?? []).filter((f) => f.priority === 'must');

  for (const [i, f] of musts.entries()) {
    out.set(`${pad(i + 1)}-${f.slug}`, {
      'requirements.md': kiroRequirements(f),
      'design.md': kiroDesign(f, architecture),
      'tasks.md': kiroTasks(f),
    });
  }
  return out;
}

function kiroRequirements(f) {
  const out = [];
  out.push(`# ${f.title} — Requirements`);
  out.push('');
  out.push('## User story');
  out.push('');
  // f.user_story.as_a already reads as a complete noun phrase ("a caregiver...", "an adult
  // child...") — prefixing a literal "a " here doubles the article ("As a a caregiver").
  out.push(`As ${f.user_story.as_a}`);
  out.push(`I want ${f.user_story.i_want}`);
  out.push(`So that ${f.user_story.so_that}`);
  out.push('');
  out.push('## Acceptance criteria');
  out.push('');
  let n = 0;
  for (const r of f.requirements ?? []) {
    const scenarios = (f.scenarios ?? []).filter((s) => s.requirement_ref === r.id);
    for (const s of scenarios) {
      n += 1;
      out.push(`${n}. **${r.id}** — ${toEars(s)}`);
    }
    if (scenarios.length === 0) {
      n += 1;
      out.push(`${n}. **${r.id}** — ${r.statement} *(no scenario — not yet demonstrable)*`);
    }
  }
  out.push('');
  return out.join('\n');
}

/**
 * Heuristic match of a flow step's free text against a component. The schema carries no field
 * linking a flow to the components it passes through — flows have only prose `steps` — so this
 * guesses relevance from the text instead of reading it off structured data. It is not a
 * guarantee: a step naming a component only by a synonym is missed, and a step that mentions an
 * id or label coincidentally would be included.
 */
function stepMentionsComponent(step, component) {
  if (step.includes(component.label)) return true;
  const escapedId = component.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedId}\\b`, 'i').test(step);
}

function kiroDesign(f, architecture) {
  const a = architecture ?? {};
  const refs = new Set(f.component_refs ?? []);
  const components = (a.components ?? []).filter((c) => refs.has(c.id));
  const invRefs = new Set((f.requirements ?? []).flatMap((r) => r.invariant_refs ?? []));
  const invariants = (a.invariants ?? []).filter((i) => invRefs.has(i.id));
  const entities = (a.entities ?? []).filter((e) => e.tenant_scoped);
  const flows = (a.flows ?? []).filter((fl) =>
    (fl.steps ?? []).some((s) => components.some((c) => stepMentionsComponent(s, c))));

  const out = [];
  out.push(`# ${f.title} — Design`);
  out.push('');
  out.push('The full architecture lives in `docs/architecture.md`.');
  out.push('');

  out.push('## Components');
  out.push('');
  if (components.length > 0) {
    // This is the slice claim, and it only holds here — Components is the one section below
    // that is actually filtered down to what this feature touches.
    out.push('The slice of the architecture this feature touches.');
    out.push('');
    for (const c of components) {
      out.push(`### ${c.label}`);
      out.push('');
      out.push(`${c.what_it_is} ${c.what_it_does}`);
      out.push('');
      out.push(`*Why this choice:* ${c.why_this_choice}`);
      out.push('');
    }
  } else {
    out.push('This feature declares no component references.');
    out.push('');
  }

  if (invariants.length > 0) {
    out.push('## Invariants this feature must uphold');
    out.push('');
    for (const i of invariants) {
      out.push(`- **${i.id}** — ${i.statement} Enforced by \`${i.enforced_by}\`.`);
    }
    out.push('');
    out.push('If the implementation would bypass any of these, stop and flag it instead of');
    out.push('shipping it.');
    out.push('');
  }

  if (entities.length > 0 && a.access_control?.model === 'rls') {
    out.push('## Data');
    out.push('');
    // Unlike Components, entities carry nothing that connects one to a feature — this section
    // is the same for every feature's folder, not a slice.
    out.push('Every tenant-scoped entity in the system — relevant whenever this feature reads or');
    out.push('writes persisted data.');
    out.push('');
    out.push(`Every query runs inside a transaction with \`${a.access_control.session_context}\` set.`);
    out.push('');
    for (const e of entities) out.push(`- \`${e.name}\` — ${e.purpose}`);
    out.push('');
  }

  if (flows.length > 0) {
    out.push('## Flows');
    out.push('');
    for (const fl of flows) {
      out.push(`### ${fl.title}`);
      out.push('');
      for (const [i, s] of (fl.steps ?? []).entries()) out.push(`${i + 1}. ${s}`);
      out.push('');
    }
  }

  return out.join('\n');
}

function kiroTasks(f) {
  const out = [];
  out.push(`# ${f.title} — Tasks`);
  out.push('');
  out.push('Work these in order. Each ends green before the next begins.');
  out.push('');
  let n = 0;
  for (const r of f.requirements ?? []) {
    const scenarios = (f.scenarios ?? []).filter((s) => s.requirement_ref === r.id);
    n += 1;
    out.push(`${n}. **${r.id}** — ${r.statement}`);
    out.push(`   - [ ] Write the failing test${scenarios.length > 1 ? 's' : ''} for ` +
      `${scenarios.map((s) => s.id).join(', ') || r.id}`);
    out.push('   - [ ] Run and confirm it fails for the right reason');
    out.push('   - [ ] Implement the minimum that makes it pass');
    out.push('   - [ ] Run the suite');
    out.push('   - [ ] Commit');
    out.push('');
  }
  out.push('## Validation');
  out.push('');
  out.push(`- [ ] Every scenario in \`features/${f.slug}.feature\` passes`);
  out.push('- [ ] No invariant in `design.md` is bypassed');
  out.push('');
  return out.join('\n');
}
