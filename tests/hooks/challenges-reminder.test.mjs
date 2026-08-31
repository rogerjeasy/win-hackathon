import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';

const HOOK = new URL('../../hooks/challenges-reminder.mjs', import.meta.url).pathname;
const TRANSCRIPT_WITH_FAILURES = new URL('../fixtures/challenges-transcript.jsonl', import.meta.url).pathname;
const TRANSCRIPT_CLEAN = new URL('../fixtures/challenges-transcript-clean.jsonl', import.meta.url).pathname;
// Matches the first line's "timestamp" field in both fixtures above.
const FIXTURE_SESSION_START = Date.parse('2026-08-30T10:00:00.000Z');

// The Stop hook's stdin envelope -- like progress-stamp.mjs's PostToolUse payload, this
// repo has no existing hook that reads stdin, so there's no established test helper for
// it. execFile's promisified form can't pipe stdin, so this spawns directly.
function runHook(hook, { cwd, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [hook], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.stdin.write(input ?? '');
    child.stdin.end();
  });
}

test('names the specific failures the transcript shows when challenges.md was not updated', async () => {
  await withTmpDir(async (root) => {
    const input = JSON.stringify({
      session_id: 's-fixture', transcript_path: TRANSCRIPT_WITH_FAILURES,
      cwd: root, hook_event_name: 'Stop', reason: 'end_turn',
    });
    const { stdout, code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.match(stdout, /win-hackathon/);
    assert.match(stdout, /challenges\.md/);
    assert.match(stdout, /ECONNREFUSED connecting to postgres on port 5432/);
    assert.match(stdout, /FAIL tests\/deploy\.test\.mjs > deploys the service/);
    assert.match(stdout, /win-hackathon:log/);
  });
});

test('silent when challenges.md was already updated after the session started', async () => {
  await withTmpDir(async (root) => {
    await mkdir(path.join(root, '.hackathon'), { recursive: true });
    const challengesPath = path.join(root, '.hackathon', 'challenges.md');
    await writeFile(challengesPath, '## logged already\n', 'utf8');
    // Force the mtime to after the fixture's session start regardless of the real
    // wall clock the test happens to run on.
    const after = new Date(FIXTURE_SESSION_START + 3_600_000);
    await utimes(challengesPath, after, after);

    const input = JSON.stringify({
      session_id: 's-fixture', transcript_path: TRANSCRIPT_WITH_FAILURES,
      cwd: root, hook_event_name: 'Stop', reason: 'end_turn',
    });
    const { stdout, code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });
});

test('silent when the transcript shows no failures at all', async () => {
  await withTmpDir(async (root) => {
    const input = JSON.stringify({
      session_id: 's-fixture-clean', transcript_path: TRANSCRIPT_CLEAN,
      cwd: root, hook_event_name: 'Stop', reason: 'end_turn',
    });
    const { stdout, code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });
});

test('never crashes on malformed stdin', async () => {
  await withTmpDir(async (root) => {
    const { code, stdout } = await runHook(HOOK, { cwd: root, input: '{not json' });
    assert.equal(code, 0);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/);
  });
});

test('never crashes when transcript_path points nowhere', async () => {
  await withTmpDir(async (root) => {
    const input = JSON.stringify({
      session_id: 's1', transcript_path: path.join(root, 'does-not-exist.jsonl'),
      cwd: root, hook_event_name: 'Stop', reason: 'end_turn',
    });
    const { code, stdout } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/);
  });
});

test('silent when stdin carries no transcript_path at all', async () => {
  await withTmpDir(async (root) => {
    const { code, stdout } = await runHook(HOOK, { cwd: root, input: '{}' });
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });
});

// Regression: transcript JSONL escapes embedded newlines as literal `\n`, so a
// failure-line match starting mid-JSON-record can otherwise run to the end of that
// record -- potentially thousands of raw JSON characters dumped via console.log. Mirrors
// inject-state.mjs's own "cap each field, then cap the whole output" contract.
test('an oversized failure match is truncated, not dumped verbatim', async () => {
  await withTmpDir(async (root) => {
    const transcriptPath = path.join(root, 'oversized.jsonl');
    const firstLine = JSON.stringify({
      type: 'user', timestamp: '2026-08-30T10:00:00.000Z', sessionId: 's-oversized',
      message: { role: 'user', content: 'go' },
    });
    // A single match, well past MAX_FIELD_CHARS, with no newline to break it up --
    // exactly the shape a match starting mid-JSON-record would take.
    const oversizedLine = `Error: ${'x'.repeat(5000)}`;
    await writeFile(transcriptPath, `${firstLine}\n${oversizedLine}\n`, 'utf8');

    const input = JSON.stringify({
      session_id: 's-oversized', transcript_path: transcriptPath,
      cwd: root, hook_event_name: 'Stop', reason: 'end_turn',
    });
    const { stdout, code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.ok(stdout.length < 4200, `output must be bounded, got ${stdout.length} chars`);
    assert.doesNotMatch(stdout, /x{500}/, 'the oversized match must not survive verbatim');
    assert.match(stdout, /…/, 'a truncated field must be marked with an ellipsis');
  });
});
