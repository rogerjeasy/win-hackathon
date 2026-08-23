#!/usr/bin/env node
import { resolveNext } from './lib/resolve-next.mjs';
import { migrateStateFile } from './lib/state.mjs';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') ? args[0] : process.cwd();
const asJson = args.includes('--json');

// Migrate before resolving. resolveNext() reads through readState(), which validates and
// therefore throws on an older schema — see status.mjs for the same reasoning. Without
// this, a user who ran M1 and upgraded to M2 gets an unhandled rejection from both of
// the two commands that are supposed to tell them what to do next.
try {
  await migrateStateFile(root);
  const resolution = await resolveNext(root);

  if (asJson) {
    console.log(JSON.stringify(resolution, null, 2));
  } else {
    console.log(`outcome: ${resolution.outcome}`);
    if (resolution.phase) console.log(`phase:   ${resolution.phase}`);
    console.log(resolution.reason);
  }
} catch (err) {
  console.error(`win-hackathon: .hackathon/state.json could not be read — ${err.message}`);
  console.error('Repair it by hand, or move it aside and run /win-hackathon:init to start over.');
  process.exit(1);
}
