import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { runOpenspec, renderProposal, OPENSPEC_PACKAGE } from '../../scripts/lib/openspec.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

/** Records calls and returns whatever the script asks for. */
function fakeExec(responses = {}) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    for (const [match, result] of Object.entries(responses)) {
      if ([cmd, ...args].join(' ').includes(match)) return result;
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  exec.calls = calls;
  return exec;
}

// Returns the text under a Markdown '## Heading' line, up to (excluding) the next '## ' heading
// or end of file. Returns null when the heading is absent. Scopes an assertion to "under the
// right heading" instead of "somewhere in the file".
function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l === heading);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

test('it never invokes the squatted bare package name', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec();
    await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    for (const call of exec.calls) {
      assert.ok(!/\bopenspec\b(?!\/)/.test(call.replace(OPENSPEC_PACKAGE, '')),
        `bare "openspec" was invoked: ${call} — the bare npm name is a squatted 0.0.0 stub`);
    }
    assert.ok(exec.calls.some((c) => c.includes(OPENSPEC_PACKAGE)));
  });
});

test('it writes one proposal per must-have feature', async () => {
  await withTmpDir(async (root) => {
    const r = await fx('h0-requirements.json');
    const res = await runOpenspec(root, r, await fx('h0-architecture.json'), { exec: fakeExec() });
    assert.equal(res.status, 'written');
    const musts = r.features.filter((f) => f.priority === 'must');
    for (const f of musts) {
      assert.ok(res.artifacts.some((a) => a.includes(f.slug)), `no proposal for ${f.slug}`);
      const body = await readFile(path.join(root, 'openspec/changes', f.slug, 'proposal.md'), 'utf8');
      assert.ok(body.includes(f.title));
    }
  });
});

test('it runs init only when openspec/ is absent, with the exact npx invocation', async () => {
  await withTmpDir(async (root) => {
    const first = fakeExec();
    await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec: first });
    // Asserting the exact command (not just "includes 'init'") closes the gap where a
    // differently-shaped call that happens to contain the substring "init" would pass silently.
    assert.ok(first.calls.includes(`npx --yes ${OPENSPEC_PACKAGE} init`),
      `expected an exact init invocation, got: ${JSON.stringify(first.calls)}`);

    const second = fakeExec();
    await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec: second });
    assert.ok(!second.calls.some((c) => c.includes('init')),
      're-running init over an initialised directory risks clobbering it');
  });
});

test('it validates after writing, with the exact npx invocation', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec();
    await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    assert.ok(exec.calls.includes(`npx --yes ${OPENSPEC_PACKAGE} validate`),
      `expected an exact validate invocation, got: ${JSON.stringify(exec.calls)}`);
    // validate must come after init, not before — validating before the proposals exist would
    // report every feature as missing.
    const initAt = exec.calls.indexOf(`npx --yes ${OPENSPEC_PACKAGE} init`);
    const validateAt = exec.calls.indexOf(`npx --yes ${OPENSPEC_PACKAGE} validate`);
    assert.ok(initAt < validateAt, `init must precede validate, got order: ${JSON.stringify(exec.calls)}`);
  });
});

test('an unreachable CLI defers rather than throwing', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec({ [OPENSPEC_PACKAGE]: { code: 127, stdout: '', stderr: 'command not found' } });
    const res = await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    assert.equal(res.status, 'deferred');
    assert.match(res.reason, /not found|unreachable|unavailable/i);
    assert.ok(res.command.includes(OPENSPEC_PACKAGE),
      'a deferred phase must tell the user the exact command to run later');
    assert.deepEqual(res.artifacts, [], 'nothing is claimed as written when the CLI never ran');
  });
});

test('an exec that throws is also a defer, not a crash', async () => {
  await withTmpDir(async (root) => {
    const exec = async () => { throw new Error('ENOENT spawn npx'); };
    const res = await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    assert.equal(res.status, 'deferred');
  });
});

test('a validate failure is reported but the proposals stay on disk', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec({ validate: { code: 1, stdout: '', stderr: 'proposal 0001 is malformed' } });
    const res = await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    assert.equal(res.status, 'deferred');
    assert.match(res.reason, /malformed|validate/i);
    const dirs = await readdir(path.join(root, 'openspec/changes'));
    assert.ok(dirs.length > 0, 'written proposals are left for the user to inspect and fix');
  });
});

test('a proposal states why, what changes and how it is verified, each under its own heading', async () => {
  const r = await fx('h0-requirements.json');
  const arch = await fx('h0-architecture.json');
  const md = renderProposal(r.features[0], arch);
  for (const heading of ['## Why', '## What changes', '## Verification']) {
    assert.ok(md.includes(heading), `proposal is missing ${heading}`);
  }

  const why = section(md, '## Why');
  assert.ok(why.includes(r.features[0].user_story.i_want),
    'the Why section must actually explain the user story, not just exist');

  const whatChanges = section(md, '## What changes');
  for (const req of r.features[0].requirements) {
    assert.ok(whatChanges.includes(req.id), `${req.id} is missing from What changes`);
  }

  const verification = section(md, '## Verification');
  for (const s of r.features[0].scenarios) {
    assert.ok(verification.includes(s.id), `${s.id} is missing from Verification`);
  }
});

test('--dry-run writes no proposal and runs no command', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec();
    const res = await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'),
      { exec, dryRun: true });
    assert.deepEqual(exec.calls, []);
    assert.ok(res.artifacts.length > 0, 'it still reports what it would write');
    const missing = await readdir(path.join(root, 'openspec')).then(() => false).catch(() => true);
    assert.equal(missing, true);
    // status is constrained to 'written' | 'deferred' by the interface, and nothing has failed
    // here, so 'written' is the only value the contract allows — but nothing has actually landed
    // on disk yet, so the reason must say so rather than let 'written' read as a completed claim.
    assert.equal(res.status, 'written');
    assert.match(res.reason, /dry.?run|preview|not.*written|nothing.*written/i,
      'a dry-run "written" status must carry a reason clarifying nothing is on disk yet');
  });
});
