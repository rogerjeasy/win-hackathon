#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  remainingHours, phaseBudgetOutstanding, cutCandidates, rankCutCandidates, applyPivot,
} from './lib/pivot-apply.mjs';
import { readState, migrateStateFile } from './lib/state.mjs';
import { requirementsPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);

function usage() {
  console.error('usage: pivot.mjs propose <project-root>');
  console.error('       pivot.mjs apply <project-root> <FR-id> [<FR-id> ...] -- <rationale>');
  process.exit(2);
}

async function loadRequirements(root) {
  return JSON.parse(await readFile(requirementsPath(root), 'utf8'));
}

if (subcommand === 'propose') {
  const root = target ? path.resolve(target) : process.cwd();
  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) { console.error('no state.json -- run /win-hackathon:init first'); process.exit(1); }
  const requirements = await loadRequirements(root);
  const ranked = rankCutCandidates(await cutCandidates(root, requirements, state.project?.cut_features ?? []));

  const hours = remainingHours(state);
  const outstanding = phaseBudgetOutstanding(state);
  console.log(hours === null
    ? 'No deadline set -- time pressure cannot be computed.'
    : `${hours.toFixed(1)}h remain against ${outstanding}h of outstanding phase budget.`);

  const proposable = ranked.filter((c) => !c.neverPropose);
  const protectedOnes = ranked.filter((c) => c.neverPropose);

  if (proposable.length === 0 && protectedOnes.length === 0) {
    console.log('Nothing to cut: nothing is left to cut.');
    process.exit(0);
  }

  if (proposable.length > 0) {
    console.log('Proposed cuts (safest first):');
    for (const c of proposable) console.log(`  ${c.id}  ${c.slug}`);
  } else {
    console.log('Nothing to cut: every not-done feature is the sole claim on a judging criterion.');
  }

  if (protectedOnes.length > 0) {
    console.log('Never proposed (sole claim on a judging criterion -- cutting one guarantees a zero on that axis):');
    for (const c of protectedOnes) console.log(`  ${c.id}  ${c.slug}`);
  }
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const sepIdx = rest.indexOf('--');
  if (sepIdx === -1) usage();
  const ids = rest.slice(0, sepIdx);
  const rationale = rest.slice(sepIdx + 1).join(' ');
  if (ids.length === 0 || rationale.trim() === '') usage();
  await applyPivot(root, ids, rationale);
  console.log(`Cut ${ids.join(', ')}. Recorded in .hackathon/decisions.md.`);
} else {
  usage();
}
