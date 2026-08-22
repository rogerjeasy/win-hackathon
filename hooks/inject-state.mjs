#!/usr/bin/env node
import { readState } from '../scripts/lib/state.mjs';
import { resolveNext } from '../scripts/lib/resolve-next.mjs';
import { PHASES } from '../scripts/lib/paths.mjs';

const MAX_LINES = 40;
// Per-value cap for free-text fields (resume_note, hackathon.name, project.name,
// required-tech entries, ...). Collapsing embedded newlines only bounds *line count* --
// a field with no newlines at all can still be hundreds of thousands of characters and
// still count as a single "line" under MAX_LINES. Cap each value independently so one
// long field can't blow up the injected context.
const MAX_FIELD_CHARS = 200;
// Last-resort backstop on the fully-joined output, independent of both the line-count
// cap and the per-field cap above -- in case some future field is pushed onto `lines`
// without going through oneLine(), or the caps above compose into something still large.
const MAX_OUTPUT_CHARS = 4000;
const ELLIPSIS = '…';
const root = process.cwd();

function oneLine(str) {
  const collapsed = String(str).replace(/[\r\n]+/g, ' ');
  return collapsed.length > MAX_FIELD_CHARS
    ? `${collapsed.slice(0, MAX_FIELD_CHARS)}${ELLIPSIS}`
    : collapsed;
}

// Everything below is wrapped in one try/catch: the hook's contract is that it must
// NEVER crash a session. readState() validates the parsed state and throws on anything
// malformed (bad JSON, bad shape); resolveNext() re-reads and interprets that state and
// can throw for the same reasons. Any failure here — known or not — must degrade to a
// short, clear message and a clean exit rather than an unhandled rejection and a raw
// stack trace on every SessionStart.
try {
  const state = await readState(root);
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
    // Cap each entry individually (map) before joining, so one very long entry can't
    // eat the whole budget and crowd out the others.
    const shown = required.slice(0, 8).map(oneLine).join(', ');
    lines.push(`Required tech (non-negotiable): ${shown}` +
      (required.length > 8 ? ` +${required.length - 8} more` : ''));
  }

  lines.push('Run /win-hackathon:next to continue, or /win-hackathon:status for the full board.');

  const output = lines.slice(0, MAX_LINES).join('\n');
  console.log(output.length > MAX_OUTPUT_CHARS
    ? `${output.slice(0, MAX_OUTPUT_CHARS)}${ELLIPSIS}`
    : output);
} catch {
  console.log('win-hackathon: .hackathon/state.json could not be read or is invalid. Run /win-hackathon:status for details.');
}
process.exit(0);
