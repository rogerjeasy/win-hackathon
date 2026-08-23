#!/usr/bin/env node
import { readState, migrateStateFile } from './lib/state.mjs';
import { resolveNext } from './lib/resolve-next.mjs';
import { checkTools } from './lib/preflight.mjs';
import { renderStatusBoard } from './lib/render.mjs';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd();

// Migrate before reading. readState() validates, so a state.json written by an older
// plugin version throws — and an uncaught throw here is a raw stack trace for a user
// whose only sin was upgrading. migrateStateFile is additive, idempotent, and a no-op
// when there is no state file at all.
//
// The catch is the same contract the SessionStart hook already honours: a genuinely
// corrupt state must produce an actionable message, not a stack trace. The hook points
// users here for details, so this is where the details have to be printable.
try {
  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    console.log('No .hackathon/state.json here. Run /win-hackathon:init to start.');
    process.exit(0);
  }

  const [resolution, tools] = await Promise.all([resolveNext(root), checkTools()]);
  console.log(renderStatusBoard({ state, resolution, tools }));
} catch (err) {
  console.error(`win-hackathon: .hackathon/state.json could not be read — ${err.message}`);
  console.error('Repair it by hand, or move it aside and run /win-hackathon:init to start over.');
  process.exit(1);
}
