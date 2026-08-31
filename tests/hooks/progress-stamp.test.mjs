import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';

const run = promisify(execFile);
const HOOK = new URL('../../hooks/progress-stamp.mjs', import.meta.url).pathname;

async function seed(root, state) {
  await mkdir(path.join(root, '.hackathon'), { recursive: true });
  await writeFile(path.join(root, '.hackathon', 'state.json'), JSON.stringify(state, null, 2), 'utf8');
}

async function initGitRepo(root) {
  await run('git', ['init', '-q'], { cwd: root });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await run('git', ['config', 'user.name', 'Test'], { cwd: root });
  await writeFile(path.join(root, 'README.md'), 'x', 'utf8');
  await run('git', ['add', '.'], { cwd: root });
  await run('git', ['commit', '-q', '-m', 'initial commit'], { cwd: root });
}

// PostToolUse hooks receive the tool call's payload as JSON on stdin -- this repo's
// existing hooks (inject-state.mjs) never read stdin, so there's no established helper
// for it. execFile's promisified form has no way to pipe stdin, so this spawns directly.
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

test('does nothing when .hackathon is absent', async () => {
  await withTmpDir(async (root) => {
    await initGitRepo(root);
    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } });
    const { stdout, code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.equal(stdout.trim(), '');
  });
});

test('stamps budget.spent_hours and budget.last_commit on disk after a git commit', async () => {
  await withTmpDir(async (root) => {
    await initGitRepo(root);
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.hackathon = { name: 'x', started_at: '2020-01-01T00:00:00Z' };
    await seed(root, state);

    const { stdout: shaOut } = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: root });
    const sha = shaOut.trim();

    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } });
    const { code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);

    const written = JSON.parse(await readFile(path.join(root, '.hackathon', 'state.json'), 'utf8'));
    assert.ok(written.budget.spent_hours > 0, 'spent_hours must advance from the started_at anchor');
    assert.equal(written.budget.last_commit.sha, sha);
    assert.ok(written.budget.last_commit.at, 'last_commit.at must be recorded');
  });
});

test('does not touch state.json when the Bash command is not a git commit', async () => {
  await withTmpDir(async (root) => {
    await initGitRepo(root);
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.hackathon = { name: 'x', started_at: '2020-01-01T00:00:00Z' };
    await seed(root, state);
    const before = await readFile(path.join(root, '.hackathon', 'state.json'), 'utf8');

    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    const { code } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);

    const after = await readFile(path.join(root, '.hackathon', 'state.json'), 'utf8');
    assert.equal(after, before, 'a non-commit Bash call must not stamp progress');
  });
});

test('never crashes on malformed stdin', async () => {
  await withTmpDir(async (root) => {
    await initGitRepo(root);
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    await seed(root, createDefaultState({ pluginVersion: '0.1.0' }));

    const { code, stdout } = await runHook(HOOK, { cwd: root, input: '{not json' });
    assert.equal(code, 0);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/);
  });
});

test('never crashes when there is no git repo at all', async () => {
  await withTmpDir(async (root) => {
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.hackathon = { name: 'x', started_at: '2020-01-01T00:00:00Z' };
    await seed(root, state);

    const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } });
    const { code, stdout } = await runHook(HOOK, { cwd: root, input });
    assert.equal(code, 0);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/);
  });
});
