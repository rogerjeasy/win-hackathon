#!/usr/bin/env node
import { readState, migrateStateFile } from '../scripts/lib/state.mjs';
import { computeDeadlinePressure } from '../scripts/lib/deadline-guard.mjs';

const root = process.cwd();
try {
  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) process.exit(0);
  const { warn, message } = computeDeadlinePressure(state);
  if (warn) console.log(`win-hackathon: ${message}`);
} catch {
  // Silent, matching inject-state.mjs's contract: this hook must never crash a session.
}
process.exit(0);
