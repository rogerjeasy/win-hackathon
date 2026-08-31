#!/usr/bin/env node
// The Stop hook's stdin envelope is documented (by the hook-development plugin skill
// installed alongside this repo, and by a real transcript-reading plugin's own test
// fixtures) to carry session_id, transcript_path, cwd, hook_event_name and -- for Stop
// specifically -- `reason`. It does NOT document a `session_started_at` field, so this
// script never assumes one exists. Instead it derives "session start" from the
// transcript itself: Claude Code transcripts are JSONL, and the first line's own
// "timestamp" field is when the session began (confirmed against a real transcript
// fixture from that same plugin). If that can't be parsed, this degrades to silence
// rather than nag based on a guess -- consistent with every other hook's never-crash,
// never-annoy-on-uncertainty contract.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Same shape as inject-state.mjs's own caps: bound each field independently so one
// oversized match can't dominate, then bound the fully-joined output as a backstop.
// Transcript JSONL escapes embedded newlines as literal `\n`, so a match starting
// mid-JSON-record can otherwise run to the end of that record -- potentially thousands
// of raw JSON characters dumped via console.log.
const MAX_FIELD_CHARS = 200;
const MAX_OUTPUT_CHARS = 4000;
const ELLIPSIS = '…';

function capField(str) {
  return str.length > MAX_FIELD_CHARS ? `${str.slice(0, MAX_FIELD_CHARS)}${ELLIPSIS}` : str;
}

const root = process.cwd();

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function parseJsonObject(raw) {
  try {
    const value = JSON.parse(raw);
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  } catch {
    return {};
  }
}

/**
 * First non-blank line's `timestamp` field, or null if it can't be determined.
 * Known limitation, accepted rather than engineered around: a resumed/continued session
 * that reuses the same transcript_path keeps this pinned to the *original* session's
 * start, not the resumed one. That can only under-fire the reminder (a stale challenges.md
 * looking "current" for longer than it should), never over-fire it or crash -- and there is
 * no session-boundary signal available in this environment's documented hook input to do
 * better against.
 */
function sessionStartFrom(transcriptText) {
  const firstLine = transcriptText.split('\n').find((line) => line.trim() !== '');
  if (!firstLine) return null;
  try {
    const parsed = JSON.parse(firstLine);
    if (typeof parsed.timestamp !== 'string') return null;
    const t = Date.parse(parsed.timestamp);
    return Number.isNaN(t) ? null : t;
  } catch {
    return null;
  }
}

try {
  const challengesPath = path.join(root, '.hackathon', 'challenges.md');
  let challengesStat = null;
  try { challengesStat = await stat(challengesPath); } catch { /* never created this session or ever */ }

  const input = parseJsonObject(await readStdin());
  // snake_case only -- the hook-development plugin skill is the one authoritative
  // reference this task found for the Stop hook's input schema, and it documents
  // transcript_path exclusively. No camelCase variant appears anywhere in it, so none
  // is assumed here either.
  const transcriptPath = input.transcript_path;
  if (!transcriptPath) process.exit(0);

  const transcript = await readFile(transcriptPath, 'utf8');

  const sessionStart = sessionStartFrom(transcript);
  if (sessionStart === null) process.exit(0); // can't tell what's "this session" -- stay quiet

  if (challengesStat && challengesStat.mtimeMs > sessionStart) process.exit(0); // already logged this session

  const failures = [...transcript.matchAll(/(?:exit code [1-9]\d*|FAIL\b.*|Error: .*)/g)]
    .map((m) => capField(m[0])).slice(0, 3);
  if (failures.length === 0) process.exit(0); // nothing substantial went wrong -- no nag

  const lines = ['win-hackathon: this session hit real failures and .hackathon/challenges.md was not updated:'];
  for (const f of failures) lines.push(`  - ${f}`);
  lines.push('Edit .hackathon/challenges.md directly to record what happened.');
  const output = lines.join('\n');
  console.log(output.length > MAX_OUTPUT_CHARS ? `${output.slice(0, MAX_OUTPUT_CHARS)}${ELLIPSIS}` : output);
} catch {
  // Silent -- same contract as every other hook.
}
process.exit(0);
