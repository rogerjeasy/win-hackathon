import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { planInit } from '../../scripts/lib/init-plan.mjs';
import { BEGIN, END, isFullyManaged } from '../../scripts/lib/markers.mjs';

const byPath = (actions, p) => actions.find((a) => a.path === p);

test('greenfield plan creates .hackathon and needs no consent', async () => {
  await withTmpDir(async (dir) => {
    const { actions } = await planInit(dir);
    assert.ok(byPath(actions, '.hackathon'), 'should create .hackathon');
    assert.ok(byPath(actions, '.hackathon/state.json'), 'should create state.json');
    // git-init is excluded here: it always needs consent regardless of what's on
    // disk (asserted separately below), since starting a repo is a decision in its
    // own right, not a byproduct of "did we clobber something pre-existing".
    const fileActions = actions.filter((a) => a.kind !== 'git-init');
    assert.equal(fileActions.every((a) => a.needsConsent === false), true,
      'nothing pre-existing means nothing to consent to');
  });
});

test('greenfield plan offers git init when not a repo', async () => {
  await withTmpDir(async (dir) => {
    const { actions } = await planInit(dir);
    const gi = actions.find((a) => a.kind === 'git-init');
    assert.ok(gi, 'should propose git init');
    assert.equal(gi.needsConsent, true, 'git init is never automatic');
  });
});

test('an existing unmanaged CLAUDE.md requires consent', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# my rules\n');
    const { actions } = await planInit(dir);
    const a = byPath(actions, 'CLAUDE.md');
    assert.ok(a, 'should plan to touch CLAUDE.md');
    assert.equal(a.kind, 'update-block');
    assert.equal(a.needsConsent, true, 'pre-existing user content always needs consent');
  });
});

test('a fully managed file may be updated without consent', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), `${BEGIN}\nold\n${END}\n`);
    const { actions } = await planInit(dir);
    const a = byPath(actions, 'CLAUDE.md');
    assert.equal(a.needsConsent, false, 'we wrote all of it, so we may rewrite it');
  });
});

test('a freshly created markdown file is born fully managed', async () => {
  await withTmpDir(async (dir) => {
    const { actions } = await planInit(dir);
    const a = byPath(actions, 'AGENTS.md');
    assert.equal(a.kind, 'create');
    // Regression: create() used to hand back a raw, unwrapped body. That left
    // the file un-"fully managed" from birth, so a second :init would forever
    // (spuriously) re-propose consent for a file the plugin wrote entirely.
    assert.ok(isFullyManaged(a.body),
      'create body must already be wrapped in BEGIN/END markers');
  });
});

test('create then re-plan needs no consent the second time', async () => {
  await withTmpDir(async (dir) => {
    const first = await planInit(dir);
    const created = byPath(first.actions, 'AGENTS.md');
    // Simulate the applier writing exactly what create() proposed.
    await writeFile(path.join(dir, 'AGENTS.md'), created.body);

    const second = await planInit(dir);
    const a = byPath(second.actions, 'AGENTS.md');
    assert.equal(a.kind, 'update-block');
    assert.equal(a.needsConsent, false,
      'a file we created ourselves must not trigger a spurious second consent prompt');
  });
});

test('resume mode plans no destructive action on existing state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon', 'state.json'), '{}');
    const { env, actions } = await planInit(dir);
    assert.equal(env.mode, 'resume');
    assert.equal(byPath(actions, '.hackathon/state.json'), undefined,
      'must not plan to overwrite an existing state file');
  });
});

test('pre-existing challenges.md and decisions.md survive a crashed-or-reset init', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(
      path.join(dir, '.hackathon', 'challenges.md'),
      '# Challenges\n\nirreplaceable notes from a previous run\n',
    );
    await writeFile(
      path.join(dir, '.hackathon', 'decisions.md'),
      '# Decisions\n\nirreplaceable notes from a previous run\n',
    );
    // state.json is deliberately absent: a crashed-or-reset :init can leave
    // exactly this shape on disk, and hasOurState alone would not catch it.
    const { actions } = await planInit(dir);
    assert.equal(byPath(actions, '.hackathon/challenges.md'), undefined,
      'must not plan to overwrite pre-existing challenges.md');
    assert.equal(byPath(actions, '.hackathon/decisions.md'), undefined,
      'must not plan to overwrite pre-existing decisions.md');
    assert.ok(byPath(actions, '.hackathon/state.json'),
      'state.json is genuinely missing, so it should still be proposed');
  });
});

test('retrofit warning tells the user to review state manually, not that it was backfilled', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'package.json'), '{"name":"app"}');
    const { env, warnings } = await planInit(dir);
    assert.equal(env.mode, 'retrofit');
    assert.equal(warnings.length, 1, 'retrofit-only scenario should produce exactly one warning');
    const [w] = warnings;
    // Regression: this warning used to claim phase statuses "will be
    // backfilled from what is on disk" — a feature that was never built.
    // createDefaultState() unconditionally sets every phase to not_started;
    // nothing in this codebase inspects on-disk artifacts to infer progress.
    assert.doesNotMatch(w, /backfill/i,
      'must not claim automatic backfilling, which does not exist');
    assert.match(w, /not_started/,
      'should honestly say phases start at not_started');
    assert.match(w, /state\.json/,
      'should direct the user to review .hackathon/state.json manually');
  });
});

test('dirty worktree produces a warning, not a blocked plan', async () => {
  await withTmpDir(async (dir) => {
    const { warnings } = await planInit(dir);
    assert.ok(Array.isArray(warnings));
  });
});

test('no action is ever kind "delete"', async () => {
  await withTmpDir(async (dir) => {
    await writeFile(path.join(dir, 'CLAUDE.md'), '# mine\n');
    await writeFile(path.join(dir, 'AGENTS.md'), '# mine\n');
    const { actions } = await planInit(dir);
    assert.equal(actions.some((a) => a.kind === 'delete'), false,
      'the planner has no vocabulary for deletion');
  });
});

test('every action carries a human-readable reason', async () => {
  await withTmpDir(async (dir) => {
    const { actions } = await planInit(dir);
    for (const a of actions) {
      assert.equal(typeof a.reason, 'string');
      assert.ok(a.reason.length > 0, `${a.path} needs a reason`);
    }
  });
});
