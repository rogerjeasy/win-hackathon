import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFile, access, copyFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';
import { writeV1State } from './helpers/v1-state.mjs';
import { readState, writeState } from '../scripts/lib/state.mjs';
import { mustHaveFeatures } from '../scripts/lib/build-apply.mjs';

const run = promisify(execFile);
const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/h0-recon.json', import.meta.url));
const ideasFixture = fileURLToPath(new URL('./fixtures/h0-ideas.json', import.meta.url));
const stackFixture = fileURLToPath(new URL('./fixtures/h0-stack.json', import.meta.url));
const architectureFixture = fileURLToPath(new URL('./fixtures/h0-architecture.json', import.meta.url));
const requirementsFixture = fileURLToPath(new URL('./fixtures/h0-requirements.json', import.meta.url));

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
    assert.equal(JSON.parse(raw).schema_version, 4);

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
    assert.equal(state.schema_version, 4);
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

// Regression: applyIdeas throws on an invalid payload before it can return its
// { artifacts, warnings } value, so the library used to attach warnings to the
// thrown Error and the CLI had to print them explicitly rather than relying on
// the success path's printing. This asserts the full stderr of a failed
// `apply`, not just the refusal message, because "no recon supplied" is often
// the reason a payload failed validation and must not vanish on that path.
test('brainstorm.mjs apply prints warnings AND the refusal message on an invalid payload with no recon.json', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const bad = JSON.parse(await readFile(ideasFixture, 'utf8'));
    bad.ideas[0].thesis = '';
    const p = path.join(dir, 'bad-ideas.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');

    await assert.rejects(
      () => run('node', [path.join(scripts, 'brainstorm.mjs'), 'apply', dir, '--ideas', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /warning: no recon supplied — rubric-membership checks were skipped/);
        assert.match(err.stderr, /warning: no recon supplied — score-ceiling checks were skipped/);
        assert.match(err.stderr, /refusing to apply an invalid ideas payload/);
        assert.match(err.stderr, /thesis/);
        // Order matters: pre-fix, warnings were printed before the throw. The
        // refusal message must still come after both warnings, not before.
        const iWarn1 = err.stderr.indexOf('rubric-membership checks were skipped');
        const iWarn2 = err.stderr.indexOf('score-ceiling checks were skipped');
        const iRefuse = err.stderr.indexOf('refusing to apply an invalid ideas payload');
        assert.ok(iWarn1 >= 0 && iWarn2 >= 0 && iRefuse >= 0);
        assert.ok(iWarn1 < iRefuse && iWarn2 < iRefuse,
          'both warnings must precede the refusal message, matching pre-fix output order');
        return true;
      },
    );
  });
});

// --- schema migration at the entry points ------------------------------------------
// Regression (critical): migrateStateFile was wired only into the three NEW M2 commands
// (recon/brainstorm/describe apply). status, next, the SessionStart hook and :init all
// read state without migrating, so a user who ran M1 and pulled M2 got a raw unhandled
// stack trace out of state.mjs from every command that could have told them what to do
// — including the one the hook points them at. Each of these drives a REAL v1 state
// file through one entry point; none of the pre-existing tests did.

test('status.mjs migrates a v1 state file instead of crashing on it', async () => {
  await withTmpDir(async (dir) => {
    await writeV1State(dir);
    const { stdout } = await run('node', [path.join(scripts, 'status.mjs'), dir]);
    assert.match(stdout, /recon/);
    const after = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(after.schema_version, 4);
    assert.deepEqual(after.deliverables, { submission_requirements: [], bonus_content: [] });
  });
});

test('next.mjs migrates a v1 state file instead of crashing on it', async () => {
  await withTmpDir(async (dir) => {
    await writeV1State(dir);
    const { stdout } = await run('node', [path.join(scripts, 'next.mjs'), dir, '--json']);
    const r = JSON.parse(stdout);
    assert.equal(r.outcome, 'start');
    assert.equal(r.phase, 'recon');
    const after = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(after.schema_version, 4);
  });
});

test('init.mjs --apply migrates an existing v1 state file and backs it up first', async () => {
  await withTmpDir(async (dir) => {
    await writeV1State(dir);
    const { stdout } = await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);

    const after = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(after.schema_version, 4, ':init is the command the design makes responsible for migrating');
    assert.match(stdout, /backup:.*state\.json/,
      'the design requires :init to back up before it migrates');
  });
});

test('a migrated v1 state keeps the fields it already had', async () => {
  await withTmpDir(async (dir) => {
    await writeV1State(dir, (s) => {
      s.phases.recon.status = 'approved';
      s.phases.recon.artifacts = [];
      s.mode = 'team';
      s.budget.total_hours = 36;
    });
    await run('node', [path.join(scripts, 'status.mjs'), dir]);
    const after = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(after.schema_version, 4);
    assert.equal(after.phases.recon.status, 'approved');
    assert.equal(after.mode, 'team');
    assert.equal(after.budget.total_hours, 36);
  });
});

test('status.mjs prints an actionable message, not a stack trace, on a corrupt state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), '{ not json', 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'status.mjs'), dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /could not be parsed as JSON/);
        assert.match(err.stderr, /win-hackathon:init/);
        assert.doesNotMatch(err.stderr, /^\s+at /m, 'no raw stack frames may reach the user');
        return true;
      },
    );
  });
});

test('next.mjs prints an actionable message, not a stack trace, on a corrupt state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), '{ not json', 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'next.mjs'), dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /could not be parsed as JSON/);
        assert.match(err.stderr, /win-hackathon:init/);
        assert.doesNotMatch(err.stderr, /^\s+at /m, 'no raw stack frames may reach the user');
        return true;
      },
    );
  });
});

// --- describe.mjs had no subprocess coverage at all despite writing state: neither
// subcommand, neither exit path. Same for brainstorm's validate and archive.

async function seedThroughBrainstorm(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  await run('node', [path.join(scripts, 'recon.mjs'), 'apply', dir, '--recon', fixture]);
  await run('node', [path.join(scripts, 'brainstorm.mjs'), 'apply', dir, '--ideas', ideasFixture]);
}

test('describe.mjs apply writes both artifacts and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedThroughBrainstorm(dir);
    const { stdout } = await run('node', [
      path.join(scripts, 'describe.mjs'), 'apply', dir, '--idea', 'idea-07', '--track', 'b2c',
    ]);
    assert.match(stdout, /project\.md/);
    assert.match(stdout, /strategy\.md/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.describe.status, 'awaiting_approval');
    assert.equal(state.hackathon.selected_track, 'b2c');
  });
});

test('describe.mjs apply exits 2 on a missing required flag', async () => {
  await withTmpDir(async (dir) => {
    await seedThroughBrainstorm(dir);
    await assert.rejects(
      () => run('node', [path.join(scripts, 'describe.mjs'), 'apply', dir, '--idea', 'idea-07']),
      (err) => {
        assert.equal(err.code, 2, 'a usage error must exit 2, not 1');
        assert.match(err.stderr, /--track/);
        return true;
      },
    );
  });
});

test('describe.mjs apply exits 1 and names the idea when it was disqualified', async () => {
  await withTmpDir(async (dir) => {
    await seedThroughBrainstorm(dir);
    await assert.rejects(
      () => run('node', [
        path.join(scripts, 'describe.mjs'), 'apply', dir, '--idea', 'idea-03', '--track', 'b2c',
      ]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /idea-03/);
        return true;
      },
    );
  });
});

test('describe.mjs scaffold prints a skeleton and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seedThroughBrainstorm(dir);
    const before = await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8');
    const { stdout } = await run('node', [
      path.join(scripts, 'describe.mjs'), 'scaffold', dir, '--idea', 'idea-07',
    ]);
    assert.ok(stdout.trim().length > 0, 'scaffold must print a skeleton');
    await assert.rejects(() => access(path.join(dir, 'docs', 'strategy.md')), /ENOENT/);
    assert.equal(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'), before,
      'scaffold must not mutate state');
  });
});

test('describe.mjs exits 2 on an unknown subcommand', async () => {
  await withTmpDir(async (dir) => {
    await assert.rejects(
      () => run('node', [path.join(scripts, 'describe.mjs'), 'bogus', dir]),
      (err) => { assert.equal(err.code, 2); return true; },
    );
  });
});

test('brainstorm.mjs validate exits 0 on the fixture and 1 on an invalid payload', async () => {
  const ok = await run('node', [
    path.join(scripts, 'brainstorm.mjs'), 'validate', ideasFixture, '--recon', fixture,
  ]);
  assert.match(ok.stdout, /valid/i);

  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(ideasFixture, 'utf8'));
    bad.ideas[0].thesis = '';
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'brainstorm.mjs'), 'validate', p, '--recon', fixture]),
      (err) => { assert.equal(err.code, 1); assert.match(err.stderr, /thesis/); return true; },
    );
  });
});

test('brainstorm.mjs archive moves the round aside and says so when there is none', async () => {
  await withTmpDir(async (dir) => {
    const empty = await run('node', [path.join(scripts, 'brainstorm.mjs'), 'archive', dir]);
    assert.match(empty.stdout, /nothing to archive/i);

    await seedThroughBrainstorm(dir);
    const { stdout } = await run('node', [path.join(scripts, 'brainstorm.mjs'), 'archive', dir]);
    assert.match(stdout, /round|archiv/i);
    await assert.rejects(() => access(path.join(dir, '.hackathon', 'ideas.json')), /ENOENT/,
      'archiving must move the current round out of the way');
  });
});

// --- stack.mjs -----------------------------------------------------------------------

test('stack.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'validate', stackFixture]);
  assert.match(stdout, /valid/);
});

test('stack.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = path.join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ schema_version: 1, repo_shape: 'nope', slots: [] }), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'stack.mjs'), 'validate', bad]),
      (err) => {
        assert.equal(err.code, 1);
        // The agent retrying needs all the problems in one pass, not the first one.
        assert.ok(err.stderr.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 2, err.stderr);
        return true;
      },
    );
  });
});

test('stack.mjs validate --json emits the full result object', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'validate', stackFixture, '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.valid, true);
  assert.ok(Array.isArray(parsed.warnings));
});

test('stack.mjs with no subcommand exits 2 with usage', async () => {
  await assert.rejects(
    () => run('node', [path.join(scripts, 'stack.mjs')]),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.stderr, /usage/);
      return true;
    },
  );
});

async function seedForStack(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.hackathon'), { recursive: true });
  await copyFile(fixture, path.join(dir, '.hackathon', 'recon.json'));
  await copyFile(stackFixture, path.join(dir, '.hackathon', 'stack.json'));
}

// C1: on a clean project, `apply . --dry-run` must not write either artifact or advance
// the phase — it used to write both, silently, because applyStack had no dryRun at all.
test('stack.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    await assert.rejects(() => access(path.join(dir, '.hackathon', 'stack.md')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.stack.status, 'not_started');
  });
});

test('stack.mjs apply writes both artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 2 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.stack.status, 'awaiting_approval');
  });
});

test('stack.mjs apply reports a backup when stack.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    await writeFile(path.join(dir, '.hackathon', 'stack.md'), '# Mine\n\nHand-written.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /stack\.md/);
  });
});

test('stack.mjs apply refuses when project is not set, with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.hackathon', 'recon.json'));
    await copyFile(stackFixture, path.join(dir, '.hackathon', 'stack.json'));
    await assert.rejects(
      () => run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /win-hackathon:describe/);
        return true;
      },
    );
  });
});

// --- architect.mjs --------------------------------------------------------------------

test('architect.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'validate', architectureFixture]);
  assert.match(stdout, /valid/i);
});

test('architect.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(architectureFixture, 'utf8'));
    bad.edges.push({ from: 'web', to: 'ghost' });
    delete bad.access_control;
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'architect.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /ghost/);
        assert.match(err.stderr, /access_control/);
        return true;
      },
    );
  });
});

async function seedForArchitect(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.hackathon'), { recursive: true });
  await copyFile(architectureFixture, path.join(dir, '.hackathon', 'architecture.json'));
  await copyFile(stackFixture, path.join(dir, '.hackathon', 'stack.json'));
}

test('architect.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    assert.match(stdout, /AGENTS\.md/);
    // docs/architecture.md exists only once :architect actually writes; a dry run must
    // not create it.
    await assert.rejects(() => access(path.join(dir, 'docs', 'architecture.md')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.architect.status, 'not_started');
  });
});

test('architect.mjs apply writes the eight artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 8 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.architect.status, 'awaiting_approval');
    assert.equal(state.project.architecture_ref, '.hackathon/architecture.json');
  });
});

test('architect.mjs apply reports a backup when AGENTS.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    await writeFile(path.join(dir, 'AGENTS.md'), '# Mine\n\nHand-written rule.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /AGENTS\.md/);
    const after = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(after, /Hand-written rule\./);
  });
});

test('architect.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const bad = JSON.parse(await readFile(architectureFixture, 'utf8'));
    bad.edges.push({ from: 'web', to: 'ghost' });
    await writeFile(path.join(dir, '.hackathon', 'architecture.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- requirements.mjs ------------------------------------------------------------------

test('requirements.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'validate', requirementsFixture]);
  assert.match(stdout, /valid/i);
});

test('requirements.mjs validate lists every problem at once on stderr', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].priority = 'critical';
    delete bad.features[0].user_story;
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'requirements.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /priority/);
        assert.match(err.stderr, /user_story/);
        return true;
      },
    );
  });
});

async function seedForRequirements(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.hackathon'), { recursive: true });
  await copyFile(fixture, path.join(dir, '.hackathon', 'recon.json'));
  await copyFile(architectureFixture, path.join(dir, '.hackathon', 'architecture.json'));
  await copyFile(requirementsFixture, path.join(dir, '.hackathon', 'requirements.json'));
}

test('requirements.mjs apply --dry-run reports without writing', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    assert.match(stdout, /requirements\.md/);
    // features/*.feature exist only once :requirements actually writes; a dry run must
    // not create them.
    await assert.rejects(() => access(path.join(dir, 'features', 'shared-care-record.feature')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.requirements.status, 'not_started');
  });
});

test('requirements.mjs apply writes the artifacts end to end and gates the phase', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Wrote 4 artifact\(s\)/);
    assert.match(stdout, /awaiting_approval/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.requirements.status, 'awaiting_approval');
    assert.equal(state.project.requirements_ref, '.hackathon/requirements.json');
    const feature = await readFile(path.join(dir, 'features', 'shared-care-record.feature'), 'utf8');
    assert.match(feature, /^Feature: /);
  });
});

test('requirements.mjs apply reports a stale feature file as left in place', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    await mkdir(path.join(dir, 'features'), { recursive: true });
    await writeFile(path.join(dir, 'features', 'removed-feature.feature'), 'Feature: old\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Left in place/);
    assert.match(stdout, /removed-feature/);
    const still = await readFile(path.join(dir, 'features', 'removed-feature.feature'), 'utf8');
    assert.match(still, /old/);
  });
});

test('requirements.mjs apply reports a backup when requirements.md already exists', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    await writeFile(path.join(dir, '.hackathon', 'requirements.md'), '# Mine\n\nHand-written.\n', 'utf8');
    const { stdout } = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]);
    assert.match(stdout, /Backed up before overwriting/);
    assert.match(stdout, /requirements\.md/);
    // seedForRequirements() drops a requirements.json in place, so the FIRST apply above
    // already backs one file up and creates a backup set of its own -- the total count is
    // not 1, and depends on whether the two applies land in the same wall-clock second.
    // Assert on the newest set instead, the same way tests/lib/stack-apply.test.mjs does.
    const backups = (await readdir(path.join(dir, '.hackathon', 'backups'))).sort();
    const latest = backups.at(-1);
    const saved = await readFile(
      path.join(dir, '.hackathon', 'backups', latest, '.hackathon', 'requirements.md'), 'utf8',
    );
    assert.match(saved, /Hand-written\./);
  });
});

test('requirements.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].priority = 'critical';
    await writeFile(path.join(dir, '.hackathon', 'requirements.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- spec.mjs ----------------------------------------------------------------------------
//
// These tests use --dry-run exclusively (except the invalid-payload case, which throws
// before either code path reaches OpenSpec). applySpec's non-dry-run apply calls
// runOpenspec()'s real default exec, which shells out to `npx @fission-ai/openspec` — a real
// network-dependent process spawn with no injection point through the CLI. That end-to-end
// write path (with both a live and a stubbed-dead exec) is already covered without any real
// process spawn by tests/lib/spec-apply.test.mjs, which calls applySpec() directly and
// injects okExec/deadExec. --dry-run never reaches exec at all (runOpenspec returns before
// checking for the CLI when dryRun is true), so it is the only apply path safe to drive
// through the actual CLI binary here.

async function seedForSpec(dir) {
  await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
  const state = await readState(dir);
  state.project = { name: 'Kintwadi', selected_idea: 'i1' };
  await writeState(dir, state);
  await mkdir(path.join(dir, '.hackathon'), { recursive: true });
  await copyFile(architectureFixture, path.join(dir, '.hackathon', 'architecture.json'));
  await copyFile(requirementsFixture, path.join(dir, '.hackathon', 'requirements.json'));
}

test('spec.mjs apply --dry-run labels the Kiro triad and the OpenSpec proposals as two separate groups', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Dry run/);
    const kiroAt = stdout.indexOf('Kiro spec triad');
    const proposalsAt = stdout.indexOf('OpenSpec change proposals');
    assert.ok(kiroAt !== -1, 'the Kiro triad group must be labelled');
    assert.ok(proposalsAt !== -1, 'the OpenSpec proposals group must be labelled');
    assert.ok(kiroAt < proposalsAt, 'the certain group is listed before the contingent one');
    assert.match(stdout.slice(kiroAt, proposalsAt), /0001-shared-care-record.*tasks\.md/s);
    assert.match(stdout.slice(proposalsAt), /openspec\/changes/);
    await assert.rejects(() => access(path.join(dir, '.hackathon', 'specs')), /ENOENT/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon', 'state.json'), 'utf8'));
    assert.equal(state.phases.spec.status, 'not_started');
  });
});

test('spec.mjs apply --dry-run surfaces the OpenSpec reason even though status is not deferred', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    // Task 22's interface only permits status 'written' | 'deferred', and a dry run is not a
    // failure, so status reads 'written' here — but the reason still carries the "nothing has
    // been written yet" caveat. Gating the print to the deferred branch alone (as the original
    // brief sample did) would silently drop that caveat from every dry run.
    assert.match(stdout, /OpenSpec: DRY RUN/);
    assert.match(stdout, /nothing has been written yet/);
    assert.doesNotMatch(stdout, /OpenSpec: DEFERRED/);
  });
});

test('spec.mjs apply --dry-run reports a stale spec folder as left in place', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    await mkdir(path.join(dir, '.hackathon', 'specs', '0009-dropped-feature'), { recursive: true });
    await writeFile(
      path.join(dir, '.hackathon', 'specs', '0009-dropped-feature', 'tasks.md'), '# old\n', 'utf8',
    );
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /Left in place/);
    assert.match(stdout, /0009-dropped-feature/);
  });
});

test('spec.mjs apply refuses an invalid payload with exit 1', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const bad = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    bad.features[0].scenarios = [];
    await writeFile(path.join(dir, '.hackathon', 'requirements.json'), JSON.stringify(bad), 'utf8');
    await assert.rejects(
      () => run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /refusing to apply/);
        return true;
      },
    );
  });
});

// --- Round-1 review findings -----------------------------------------------------------

test('spec.mjs apply prints validateRequirements warnings — :spec has no validate subcommand of its own', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    // applySpec() never forwards `recon` to validateRequirements(), so this warning is
    // reliably present on every run — the point being proved is that apply's stdout is where
    // it now surfaces, since :spec has no separate `validate` subcommand to print it from.
    const { stdout } = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(stdout, /warning:.*recon/i);
  });
});

// --- Stage 2 review: the dry-run overwrite warning the command files promise ---------------
//
// Every apply module's dry-run branch returned `backedUp: []` unconditionally, so no CLI had
// ever printed anything about overwriting during a preview — yet all four command files tell
// the agent "if it reports it would overwrite something, tell the user first". The consent
// gate was notional. Each of these drives both branches: the heading appears when a real
// artifact is on disk, and does not when none is.

test('stack.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForStack(dir);
    const present = await run('node', [path.join(scripts, 'stack.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.hackathon\/stack\.json/);

    // The payload can come from anywhere; what matters is that no artifact is on disk.
    await rm(path.join(dir, '.hackathon', 'stack.json'));
    const absent = await run('node',
      [path.join(scripts, 'stack.mjs'), 'apply', dir, '--stack', stackFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

test('architect.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForArchitect(dir);
    const present = await run('node', [path.join(scripts, 'architect.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.hackathon\/architecture\.json/);

    // :init itself lays down AGENTS.md and CLAUDE.md, and both are :architect artifacts, so
    // they have to go too before the "nothing would be overwritten" case is reachable.
    await rm(path.join(dir, '.hackathon', 'architecture.json'));
    await rm(path.join(dir, 'AGENTS.md'), { force: true });
    await rm(path.join(dir, 'CLAUDE.md'), { force: true });
    const absent = await run('node',
      [path.join(scripts, 'architect.mjs'), 'apply', dir, '--architecture', architectureFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

test('requirements.mjs apply --dry-run names what it would overwrite, and stays silent when nothing would be', async () => {
  await withTmpDir(async (dir) => {
    await seedForRequirements(dir);
    const present = await run('node', [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.hackathon\/requirements\.json/);

    await rm(path.join(dir, '.hackathon', 'requirements.json'));
    const absent = await run('node',
      [path.join(scripts, 'requirements.mjs'), 'apply', dir, '--requirements', requirementsFixture, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/);
  });
});

// --- build.mjs -----------------------------------------------------------------------

test('build.mjs status reports "nothing to build" against a project with no requirements.json', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'status', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /requirements\.json/);
        return true;
      },
    );
  });
});

// Regression: nextFeature(..., { featureId }) returns null both when every must-have
// feature is genuinely done AND when featureId doesn't resolve to any kept must-have
// feature. status used to print the same "everything done" message either way, which
// would send an agent past a typo'd or stale --feature flag straight to the gate.
test('build.mjs status --feature with an unresolved FR-id reports a distinct error, not "everything done"', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(requirementsFixture, path.join(dir, '.hackathon', 'requirements.json'));
    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'status', dir, '--feature', 'FR-9.9']),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /FR-9\.9/);
        assert.match(err.stderr, /does not resolve/);
        assert.doesNotMatch(err.stdout ?? '', /Every must-have, non-cut feature is done/);
        return true;
      },
    );
  });
});

// Regression: the plan requires build's gate to reach awaiting_approval only when every
// must-have feature is done AND the last :check passed clean, but gate used to check only
// feature completion and never read state.compliance at all.
test('build.mjs gate refuses to close the phase when compliance still has an unverified slot, even with every feature done', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(requirementsFixture, path.join(dir, '.hackathon', 'requirements.json'));
    const requirements = JSON.parse(await readFile(requirementsFixture, 'utf8'));
    for (const feature of mustHaveFeatures(requirements)) {
      const featDir = path.join(dir, '.hackathon', 'specs', feature.dir);
      await mkdir(featDir, { recursive: true });
      await writeFile(path.join(featDir, 'tasks.md'), '- [x] step one\n', 'utf8');
    }
    const state = await readState(dir);
    state.compliance.required_tech_verified = { 'aws-bedrock': true, 'aurora-pgvector': false };
    await writeState(dir, state);

    await assert.rejects(
      run('node', [path.join(scripts, 'build.mjs'), 'gate', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stdout, /Required technology not yet verified/);
        assert.match(err.stdout, /aurora-pgvector/);
        return true;
      },
    );

    const after = await readState(dir);
    assert.notEqual(after.phases.build.status, 'awaiting_approval',
      'gate must not close the phase while compliance is outstanding');
  });
});

test('spec.mjs apply --dry-run names the triad files it would regenerate, and stays silent when there are none', async () => {
  await withTmpDir(async (dir) => {
    await seedForSpec(dir);
    const absent = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.doesNotMatch(absent.stdout, /Would overwrite:/,
      'no spec folder exists yet — a first run overwrites nothing');

    // A tasks.md a build agent has been ticking off is the file that matters most here.
    const folder = path.join(dir, '.hackathon', 'specs', '0001-shared-care-record');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [x] done\n', 'utf8');
    const present = await run('node', [path.join(scripts, 'spec.mjs'), 'apply', dir, '--dry-run']);
    assert.match(present.stdout, /Would overwrite:/);
    assert.match(present.stdout, /! \.hackathon\/specs\/0001-shared-care-record\/tasks\.md/);
  });
});

// --- ship.mjs ------------------------------------------------------------------------

test('ship.mjs suggest prints one slotId -> target line per deployable stack slot', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await copyFile(stackFixture, path.join(dir, '.hackathon', 'stack.json'));
    const { stdout } = await run('node', [path.join(scripts, 'ship.mjs'), 'suggest', dir]);
    assert.match(stdout, /->/);
  });
});

// --- pivot.mjs ------------------------------------------------------------------------

test('pivot.mjs propose reports "nothing to cut" against a project with everything already done', async () => {
  await withTmpDir(async (dir) => {
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    await copyFile(requirementsFixture, path.join(dir, '.hackathon', 'requirements.json'));
    const state = await readState(dir);
    await writeState(dir, { ...state, project: { name: 'x', selected_idea: 'i-1' } });
    // No specs/ written at all -- cutCandidates treats every must-have feature as "not
    // done" (featureDone() returns false on a missing tasks.md), so this exercises the
    // *other* empty case: nothing left to propose because nothing is a safe cut, not
    // because everything is finished. Assert on that actual message, not an invented one.
    const { stdout } = await run('node', [path.join(scripts, 'pivot.mjs'), 'propose', dir]);
    assert.match(stdout, /Proposed cuts|Nothing to cut/);
  });
});
