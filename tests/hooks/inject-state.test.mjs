import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

const run = promisify(execFile);
const hook = fileURLToPath(new URL('../../hooks/inject-state.mjs', import.meta.url));

test('hook is silent in a project with no .hackathon directory', async () => {
  await withTmpDir(async (dir) => {
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.equal(stdout.trim(), '', 'must add nothing to unrelated projects');
  });
});

test('hook reports the current phase', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'approved';
    s.hackathon = { name: 'AWS AI Hack', deadline: null, tech: { required: ['Bedrock'] } };
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.match(stdout, /win-hackathon/);
    assert.match(stdout, /brainstorm/, 'should name the next phase');
    assert.match(stdout, /Bedrock/, 'required tech is a standing constraint');
  });
});

test('hook output never exceeds 40 lines', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'Big Hack',
      deadline: null,
      tech: { required: Array.from({ length: 60 }, (_, i) => `tech-${i}`) },
    };
    for (const p of Object.keys(s.phases)) s.phases[p].status = 'approved';
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `got ${stdout.split('\n').length} lines`);
  });
});

test('hook output never exceeds 40 lines even when resume_note has embedded newlines', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'in_progress';
    s.phases.recon.resume_note = Array.from({ length: 500 }, (_, i) => `chunk-${i}`).join('\n');
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `got ${stdout.split('\n').length} lines`);
  });
});

test('hook output never exceeds 40 lines even when deadline has embedded newlines', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'Deadline Hack',
      deadline: Array.from({ length: 500 }, (_, i) => `d${i}`).join('\n'),
      tech: { required: [] },
    };
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `got ${stdout.split('\n').length} lines`);
  });
});

test('hook output never exceeds 40 lines even when a required-tech entry has embedded newlines', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'Tech Hack',
      deadline: null,
      tech: { required: [Array.from({ length: 500 }, (_, i) => `t${i}`).join('\n')] },
    };
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `got ${stdout.split('\n').length} lines`);
  });
});

// Regression: the 40-line cap bounds line *count*, not byte length. A free-text field
// with no embedded newlines at all (so oneLine()'s collapsing is a no-op) still counted
// as a single "line" no matter how long it was, so a 400,000-character resume_note with
// no newlines cleared the <=40-line cap while injecting ~400KB into every session.
test('a very long no-newline resume_note is truncated, not just line-capped', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'in_progress';
    s.phases.recon.resume_note = 'x'.repeat(400_000); // no newlines anywhere
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `got ${stdout.split('\n').length} lines`);
    assert.ok(stdout.length < 5000,
      `output must be bounded by length too, got ${stdout.length} chars`);
  });
});

test('hook surfaces a resume note so a mid-phase /clear is recoverable', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'in_progress';
    s.phases.recon.resume_note = 'rules page fetched, criteria still to extract';
    await writeState(dir, s);

    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.match(stdout, /criteria still to extract/);
  });
});

test('hook exits 0 and stays quiet on a corrupt state file', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon', 'state.json'), '{ broken', 'utf8');
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.match(stdout, /could not be read/i);
  });
});

// Regression: a hand-edited state.json that is valid JSON but has a malformed
// `artifacts` field (a string instead of an array — exactly the edit commands/init.md's
// retrofit instructions invite a person or agent to make by hand) used to either produce
// nonsense drift reports or crash resolve-next.mjs's missingArtifacts() with an unhandled
// TypeError, printing a raw stack trace on every SessionStart. The hook must never crash
// a session: it should degrade to a short, clear message and exit 0.
test('hook exits 0 with a clear message when artifacts is a string instead of an array', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'approved';
    s.phases.recon.artifacts = 'docs/architecture.md';
    // Bypass writeState (which would refuse this) to simulate a hand-edited file,
    // the same way a user following the retrofit instructions might type it.
    await writeFile(path.join(dir, '.hackathon', 'state.json'), JSON.stringify(s, null, 2), 'utf8');

    const { stdout, code } = await run('node', [hook], { cwd: dir })
      .then((r) => ({ ...r, code: 0 }))
      .catch((err) => ({ stdout: err.stdout ?? '', code: err.code ?? 1 }));

    assert.equal(code, 0, 'hook must exit 0 even when state is malformed');
    assert.match(stdout, /win-hackathon/i);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/,
      'must show a short clear message, not a raw stack trace');
  });
});

test('hook exits 0 with a clear message when artifacts is null', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.phases.recon.status = 'approved';
    s.phases.recon.artifacts = null;
    await writeFile(path.join(dir, '.hackathon', 'state.json'), JSON.stringify(s, null, 2), 'utf8');

    const { stdout, code } = await run('node', [hook], { cwd: dir })
      .then((r) => ({ ...r, code: 0 }))
      .catch((err) => ({ stdout: err.stdout ?? '', code: err.code ?? 1 }));

    assert.equal(code, 0, 'hook must exit 0 even when state is malformed');
    assert.match(stdout, /win-hackathon/i);
    assert.doesNotMatch(stdout, /TypeError|at \w+ \(|\.mjs:\d+/,
      'must show a short clear message, not a raw stack trace');
  });
});

test('the hook names the next action deadline', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'H0', url: 'https://h01.devpost.com',
      deadline: '2099-06-29T17:00:00-07:00',
      next_action_deadline: { label: 'credit request form closes', at: '2099-06-26T12:00:00-07:00' },
      tech: { required: ['AWS Database'] },
      criteria_ids: ['technical-implementation'], tiebreak: 'listed_order',
      bonus_points_available: 0.6, selected_track: null, recon_ref: '.hackathon/recon.json',
    };
    await writeState(dir, s);
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.match(stdout, /credit request form closes/);
  });
});

test('the hook names the tiebreak-first criterion', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'H0', url: 'https://h01.devpost.com',
      deadline: '2099-06-29T17:00:00-07:00', next_action_deadline: null,
      tech: { required: [] },
      criteria_ids: ['technical-implementation', 'design'], tiebreak: 'listed_order',
      bonus_points_available: 0, selected_track: null, recon_ref: '.hackathon/recon.json',
    };
    await writeState(dir, s);
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.match(stdout, /technical-implementation/);
    assert.match(stdout, /tie/i);
  });
});

test('the hook stays within the line cap with every M2 field populated', async () => {
  await withTmpDir(async (dir) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.hackathon = {
      name: 'H0: Hack the Zero Stack with Vercel v0 and AWS Databases',
      url: 'https://h01.devpost.com',
      deadline: '2099-06-29T17:00:00-07:00',
      next_action_deadline: { label: 'credit request form closes', at: '2099-06-26T12:00:00-07:00' },
      tech: { required: Array.from({ length: 20 }, (_, i) => `required-tech-${i}`) },
      criteria_ids: ['technical-implementation', 'design', 'impact', 'originality'],
      tiebreak: 'listed_order', bonus_points_available: 0.6,
      selected_track: 'b2c', recon_ref: '.hackathon/recon.json',
    };
    s.project = { name: 'CareCircle' };
    s.deliverables = {
      submission_requirements: Array.from({ length: 10 }, (_, i) => ({ id: `req-${i}`, status: 'not_started' })),
      bonus_content: Array.from({ length: 3 }, (_, i) => ({ id: `bonus-${i}`, status: 'not_started' })),
    };
    await writeState(dir, s);
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.ok(stdout.split('\n').length <= 40, `hook emitted ${stdout.split('\n').length} lines`);
  });
});

test('the hook stays silent when the hackathon block is still null', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const { stdout } = await run('node', [hook], { cwd: dir });
    assert.doesNotMatch(stdout, /undefined/);
    assert.doesNotMatch(stdout, /tie/i);
  });
});
