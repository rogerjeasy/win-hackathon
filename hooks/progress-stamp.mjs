#!/usr/bin/env node
// PostToolUse filtering happens here, not in hooks.json's matcher. Claude Code's
// documented matcher syntax (see the hook-development plugin skill this repo's authors
// have installed, and every worked example in it) only matches on tool NAME -- "Bash",
// "Read|Write", "mcp__.*" -- there is no command-substring condition like
// `Bash(git commit:*)` for a command hook's matcher to filter on. So hooks.json's
// PostToolUse entry below matches `"Bash"` (every Bash call) and this script reads the
// tool_input the harness sends on stdin to narrow that down to an actual `git commit`,
// exiting silently for every other Bash invocation.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readState, writeState, migrateStateFile } from '../scripts/lib/state.mjs';
import { computeSpentHours } from '../scripts/lib/progress-stamp.mjs';

const run = promisify(execFile);
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

try {
  const input = parseJsonObject(await readStdin());
  // snake_case only -- the hook-development plugin skill is the one authoritative
  // reference this task found for PostToolUse's input schema, and it documents
  // tool_input exclusively. No camelCase variant appears anywhere in it, so none is
  // assumed here either.
  const command = input.tool_input?.command ?? '';
  if (!/\bgit\s+commit\b/.test(command)) process.exit(0);

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) process.exit(0);
  const { stdout } = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: root });
  const sha = stdout.trim();
  const { spent_hours, last_commit } = computeSpentHours(state, { sha });
  await writeState(root, { ...state, budget: { ...state.budget, spent_hours, last_commit } });
} catch {
  // Silent -- a stamping failure must never block the commit that triggered it.
}
process.exit(0);
