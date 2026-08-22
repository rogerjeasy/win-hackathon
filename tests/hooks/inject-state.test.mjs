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
