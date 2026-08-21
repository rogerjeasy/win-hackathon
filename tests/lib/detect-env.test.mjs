import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { detectEnvironment } from '../../scripts/lib/detect-env.mjs';

function git(dir, ...args) {
  execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
}

async function initRepo(dir) {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
}

test('scenario A: empty folder is greenfield and not a git repo', async () => {
  await withTmpDir(async (dir) => {
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'greenfield');
    assert.equal(env.isEmpty, true);
    assert.ok(env.scenarios.includes('A'));
    assert.ok(env.scenarios.includes('E'), 'no .git means scenario E');
  });
});

test('scenario B: foreign agent config triggers adopt mode', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# existing rules\n');
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'adopt');
    assert.equal(env.hasForeignAgentConfig, true);
    assert.deepEqual(env.foreignAgentFiles, ['CLAUDE.md']);
    assert.ok(env.scenarios.includes('B'));
  });
});

test('scenario C: our state file wins over everything and means resume', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# existing\n');
    await writeFile(path.join(dir, 'package.json'), '{}');
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon', 'state.json'), '{}');
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'resume');
    assert.equal(env.hasOurState, true);
    assert.ok(env.scenarios.includes('C'));
  });
});

test('scenario D: source files without agent config means retrofit', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'retrofit');
    assert.equal(env.hasSourceFiles, true);
    assert.ok(env.scenarios.includes('D'));
  });
});

test('scenario E is absent inside a git repo', async () => {
  await withTmpDir(async (dir) => {
    await initRepo(dir);
    const env = await detectEnvironment(dir);
    assert.equal(env.isGitRepo, true);
    assert.ok(!env.scenarios.includes('E'));
  });
});

test('scenario F: uncommitted changes are detected', async () => {
  await withTmpDir(async (dir) => {
    await initRepo(dir);
    await writeFile(path.join(dir, 'README.md'), 'hello\n');
    const env = await detectEnvironment(dir);
    assert.equal(env.isDirty, true);
    assert.ok(env.scenarios.includes('F'));
  });
});

test('a clean committed repo is not dirty', async () => {
  await withTmpDir(async (dir) => {
    await initRepo(dir);
    await writeFile(path.join(dir, 'README.md'), 'hello\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'init');
    const env = await detectEnvironment(dir);
    assert.equal(env.isDirty, false);
    assert.ok(!env.scenarios.includes('F'));
  });
});

test('scenarios compose: adopt inside a dirty non-git tree', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'AGENTS.md'), '# rules\n');
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'adopt');
    assert.ok(env.scenarios.includes('B'));
    assert.ok(env.scenarios.includes('E'));
  });
});

test('a .claude directory alone counts as foreign agent config', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.claude'), { recursive: true });
    const env = await detectEnvironment(dir);
    assert.equal(env.hasForeignAgentConfig, true);
    assert.equal(env.mode, 'adopt');
  });
});

test('dotfiles alone do not make a folder non-empty', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, '.DS_Store'), '');
    const env = await detectEnvironment(dir);
    assert.equal(env.isEmpty, true);
    assert.equal(env.mode, 'greenfield');
  });
});

test('a real git worktree checkout is detected as a git repo, including dirty state', async () => {
  await withTmpDir(async (dir) => {
    const main = path.join(dir, 'main');
    const wt = path.join(dir, 'wt');
    await mkdir(main, { recursive: true });
    await initRepo(main);
    await writeFile(path.join(main, 'README.md'), 'hello\n');
    git(main, 'add', '-A');
    git(main, 'commit', '-q', '-m', 'init');
    git(main, 'branch', '-q', 'wtbranch');
    git(main, 'worktree', 'add', '-q', wt, 'wtbranch');

    const clean = await detectEnvironment(wt);
    assert.equal(clean.isGitRepo, true, 'worktree checkout must be recognized as a git repo');
    assert.ok(!clean.scenarios.includes('E'));

    await writeFile(path.join(wt, 'README.md'), 'hello\nedited\n');
    const dirty = await detectEnvironment(wt);
    assert.equal(dirty.isDirty, true, 'an uncommitted edit inside a worktree must be seen as dirty');
    assert.ok(dirty.scenarios.includes('F'));
  });
});

test('a directory containing only our state file is resume, not also empty/greenfield', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon', 'state.json'), '{}');
    const env = await detectEnvironment(dir);
    assert.equal(env.mode, 'resume');
    assert.ok(!env.scenarios.includes('A'), 'resume must not also claim the folder is empty/greenfield');
    assert.ok(env.scenarios.includes('C'));
  });
});
