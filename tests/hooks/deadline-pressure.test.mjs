import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';

const run = promisify(execFile);
const HOOK = new URL('../../hooks/deadline-pressure.mjs', import.meta.url).pathname;

async function seed(root, state) {
  await mkdir(path.join(root, '.hackathon'), { recursive: true });
  await writeFile(path.join(root, '.hackathon', 'state.json'), JSON.stringify(state, null, 2), 'utf8');
}

test('silent (empty stdout) when .hackathon is absent', async () => {
  await withTmpDir(async (root) => {
    const { stdout } = await run('node', [HOOK], { cwd: root });
    assert.equal(stdout.trim(), '');
  });
});

test('silent with a far-future deadline and full budget', async () => {
  await withTmpDir(async (root) => {
    // build a full v4 default state the same way schema.test.mjs's fixtures do, with
    // hackathon.deadline far in the future and budget.total_hours generous
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.hackathon = { name: 'x', deadline: '2099-01-01T00:00:00Z' };
    state.budget.total_hours = 48;
    await seed(root, state);
    const { stdout } = await run('node', [HOOK], { cwd: root });
    assert.equal(stdout.trim(), '');
  });
});

test('warns with a near-past deadline', async () => {
  await withTmpDir(async (root) => {
    const { createDefaultState } = await import('../../scripts/lib/schema.mjs');
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.hackathon = { name: 'x', deadline: '2020-01-01T00:00:00Z' }; // long past
    state.budget.total_hours = 48;
    await seed(root, state);
    const { stdout } = await run('node', [HOOK], { cwd: root });
    assert.match(stdout, /:pivot/);
  });
});

test('never crashes on a malformed state.json', async () => {
  await withTmpDir(async (root) => {
    await mkdir(path.join(root, '.hackathon'), { recursive: true });
    await writeFile(path.join(root, '.hackathon', 'state.json'), '{not json', 'utf8');
    const { stdout } = await run('node', [HOOK], { cwd: root });
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/);
  });
});
