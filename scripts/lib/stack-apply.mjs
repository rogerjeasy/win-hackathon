import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, STACK_FILE, statePath } from './paths.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { validateStack } from './stack-schema.mjs';
import { renderTable } from './render.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;

export function renderStack(stack) {
  const out = [];
  out.push('# Stack');
  out.push('');
  out.push(`**Repository shape:** \`${stack.repo_shape}\``);
  out.push('');
  out.push(stack.shape_rationale);
  out.push('');
  out.push('## Stack');
  out.push('');
  out.push(renderTable(
    ['Slot', 'Choice', 'Source', 'Thesis', 'Why'],
    stack.slots.map((s) => [s.id, s.choice, s.source, s.thesis_support, s.rationale]),
  ));

  const pins = stack.bleeding_edge ?? [];
  if (pins.length > 0) {
    out.push('');
    out.push('## Bleeding edge');
    out.push('');
    out.push('Pins whose APIs may differ from any agent\'s training data. Read the vendored');
    out.push('docs before writing code against them.');
    out.push('');
    out.push(renderTable(
      ['Package', 'Pin', 'Docs'],
      pins.map((p) => [p.package, p.pin, p.docs_path ?? '—']),
    ));
  }

  const rejected = stack.rejected ?? [];
  if (rejected.length > 0) {
    out.push('');
    out.push('## Rejected');
    out.push('');
    // :submit draws on this. A rejected option with a stated reason is evidence of a
    // deliberate architectural choice, which is what Technical Implementation asks for.
    out.push(renderTable(
      ['Slot', 'Rejected', 'Why not'],
      rejected.map((r) => [r.slot ?? '—', r.choice, r.why_not]),
    ));
  }

  out.push('');
  return out.join('\n');
}

/** One false entry per required slot. :ship and :check flip them in M4. */
export function buildComplianceSeed(stack) {
  const seed = {};
  for (const slot of stack.slots ?? []) {
    if (slot?.source !== 'required') continue;
    const ref = slot?.requirement_ref;
    if (typeof ref === 'string' && ref.trim() !== '') seed[ref] = false;
  }
  return seed;
}

function primaryDatabase(stack) {
  const dbSlot = (stack.slots ?? []).find((s) => /(^|[-_])db$|database|datastore/i.test(s?.id ?? ''));
  return dbSlot?.choice ?? null;
}

export async function applyStack(root, stack, { recon } = {}) {
  const { valid, errors } = validateStack(stack, recon);
  if (!valid) {
    throw new Error(`refusing to apply an invalid stack payload:\n  ${errors.join('\n  ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  const files = [
    [STACK_FILE, `${JSON.stringify(stack, null, 2)}\n`],
    ['stack.md', renderStack(stack)],
  ];
  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }
  const artifacts = files.map(([name]) => rel(name));

  const next = {
    ...state,
    project: {
      ...state.project,
      stack: {
        repo_shape: stack.repo_shape,
        primary_database: primaryDatabase(stack),
        ref: rel(STACK_FILE),
      },
    },
    compliance: {
      ...state.compliance,
      // Merge, never replace: a re-run of :stack must not un-verify something :check
      // already confirmed.
      required_tech_verified: {
        ...buildComplianceSeed(stack),
        ...(state.compliance?.required_tech_verified ?? {}),
      },
    },
    phases: {
      ...state.phases,
      stack: { ...state.phases.stack, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts };
}
