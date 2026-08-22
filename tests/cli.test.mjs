import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, access, copyFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';

const run = promisify(execFile);
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/h0-recon.json', import.meta.url));

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
    assert.equal(JSON.parse(raw).schema_version, 2);

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

// Regression: git-init's consent token is the bare path "." (Action.path for the
// git-init action). `--consent "CLAUDE.md, ."` — a space after the comma, the most
// natural way to type a list — used to split into ['CLAUDE.md', ' .'] with no
// trimming, so ' .' never exact-matched the '.' the applier checks for and git-init
// was silently skipped despite looking approved.
test('init --apply --consent trims whitespace so a space-separated list still matches', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    const { stdout } = await run(
      'node', [path.join(scripts, 'init.mjs'), dir, '--apply', '--consent', 'CLAUDE.md, .'],
    );

    const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.match(after, /BEGIN:win-hackathon/,
      'CLAUDE.md consent must still match despite no leading space in this entry');
    assert.equal(await access(path.join(dir, '.git')).then(() => true, () => false), true,
      'git-init consent (the "." entry, with a leading space from the list) must still match');
    assert.equal(stdout.includes('Skipped'), false,
      'nothing should be reported skipped once every listed action is consented');
  });
});

// Regression: the skipped-actions report used to print only the bare path (e.g. "- .",
// which does not say what "." refers to). It must name the action's kind too.
test('init --apply reports skipped actions with both kind and path', async () => {
  await withTmpDir(async (dir) => {
    await import('node:fs/promises').then(({ writeFile }) =>
      writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n'));
    const { stdout } = await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);

    assert.match(stdout, /-\s+update-block\s+CLAUDE\.md/,
      'a skipped file action must report its kind, not just its bare path');
    assert.match(stdout, /-\s+git-init\s+\./,
      'a skipped git-init must read as "git-init .", not the uninformative bare "."');
  });
});

test('recon.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'validate', fixture]);
  assert.match(stdout, /valid/i);
});

test('recon.mjs validate exits non-zero and names every problem on a bad payload', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(fixture, 'utf8'));
    bad.dates[0].at = 'June 29';
    bad.criteria.items[0].quote = '';
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');

    await assert.rejects(
      () => run('node', [path.join(scripts, 'recon.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /offset/);
        assert.match(err.stderr, /quote/);
        return true;
      },
    );
  });
});

test('recon.mjs validate --json emits a machine-readable result', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'validate', fixture, '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.errors, []);
});

test('recon.mjs apply writes the artifacts end to end', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.hackathon/recon.json'));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'apply', dir]);
    assert.match(stdout, /brief\.md/);
    assert.match(stdout, /criteria\.md/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(state.schema_version, 2);
    assert.ok(state.hackathon.deadline.endsWith('-07:00'));
  });
});

test('recon.mjs apply refuses to run when there is no state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.hackathon/recon.json'));
    await assert.rejects(
      () => run('node', [path.join(scripts, 'recon.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /init/i);
        return true;
      },
    );
  });
});
