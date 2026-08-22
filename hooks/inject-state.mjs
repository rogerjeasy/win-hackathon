#!/usr/bin/env node
import { readState } from '../scripts/lib/state.mjs';
import { resolveNext } from '../scripts/lib/resolve-next.mjs';
import { PHASES } from '../scripts/lib/paths.mjs';

const MAX_LINES = 40;
const root = process.cwd();

function oneLine(str) {
  return String(str).replace(/[\r\n]+/g, ' ');
}

let state;
try {
  state = await readState(root);
} catch {
  console.log('win-hackathon: .hackathon/state.json could not be read (invalid JSON). Run /win-hackathon:status.');
  process.exit(0);
}
if (state === null) process.exit(0);

const resolution = await resolveNext(root);
const lines = [];

lines.push('## win-hackathon');
if (state.hackathon?.name) lines.push(`Hackathon: ${oneLine(state.hackathon.name)}`);
if (state.project?.name) lines.push(`Project: ${oneLine(state.project.name)}`);

if (state.hackathon?.deadline) {
  const hoursLeft = Math.round((Date.parse(state.hackathon.deadline) - Date.now()) / 3_600_000);
  lines.push(`Deadline: ${oneLine(state.hackathon.deadline)} (~${hoursLeft}h left)`);
}

const done = PHASES.filter((p) => state.phases[p]?.status === 'approved');
lines.push(`Approved: ${done.length > 0 ? done.join(', ') : 'none yet'}`);

if (resolution.outcome === 'drift') {
  lines.push('!! DRIFT — state disagrees with the filesystem. Stop and resolve before continuing:');
  for (const d of resolution.drift) lines.push(`   ${d.phase}: missing ${oneLine(d.missing.join(', '))}`);
} else {
  lines.push(`Next: ${resolution.phase ?? 'nothing — all phases resolved'} (${resolution.outcome})`);
  lines.push(oneLine(resolution.reason));
}

const required = state.hackathon?.tech?.required ?? [];
if (required.length > 0) {
  lines.push(`Required tech (non-negotiable): ${oneLine(required.slice(0, 8).join(', '))}` +
    (required.length > 8 ? ` +${required.length - 8} more` : ''));
}

lines.push('Run /win-hackathon:next to continue, or /win-hackathon:status for the full board.');

console.log(lines.slice(0, MAX_LINES).join('\n'));
