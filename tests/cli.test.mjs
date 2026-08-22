import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';

const run = promisify(execFile);
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));

test('init --dry-run writes nothing', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [path.join(scripts, 'init.mjs'), dir, '--dry-run']);
    assert.match(stdout, /\.hackathon/);
    await assert.rejects(() => access(path.join(dir, '.hackathon')), /ENOENT/);
  });
});

test('init --apply creates state, then status reports phase one', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const raw = await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8');
    assert.equal(JSON.parse(raw).schema_version, 1);

    const { stdout } = await run('node', [path.join(scripts, 'status.mjs'), dir]);
    assert.match(stdout, /recon/);
  });
});

test('next --json emits a machine-readable resolution', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    const r = JSON.parse(stdout);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'recon');
  });
});

test('next on a bare directory tells you to init', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    assert.equal(JSON.parse(stdout).outcome, 'init');
  });
});

test('init --apply without consent leaves an existing CLAUDE.md untouched', async () => {
  await withTmpDir(async (dir) => {
    const original = '# mine\n';
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), original));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), original);
  });
});

test('init --apply --consent applies the named file only', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply', '--consent', 'CLAUDE.md']);
    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(after, /BEGIN:win-hackathon/);
    assert.match(after, /# mine/);
  });
});
