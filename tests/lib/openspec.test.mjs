import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { runOpenspec, renderProposal, OPENSPEC_PACKAGE } from '../../scripts/lib/openspec.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

/** Records calls (and the cwd each was made with) and returns whatever the script asks for. */
function fakeExec(responses = {}) {
  const calls = [];
  const cwds = [];
  const exec = async (cmd, args, opts) => {
    calls.push([cmd, ...args].join(' '));
    cwds.push(opts?.cwd);
    for (const [match, result] of Object.entries(responses)) {
      if ([cmd, ...args].join(' ').includes(match)) return result;
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  exec.calls = calls;
  exec.cwds = cwds;
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

test('OPENSPEC_PACKAGE is the real scoped package, not the squatted bare name', () => {
  // A literal, hardcoded expectation — not routed through the constant under test — so an edit
  // that corrupts the constant itself (e.g. back to the squatted bare 'openspec') is caught here
  // directly, rather than relying on every other assertion that imports the same constant.
  assert.equal(OPENSPEC_PACKAGE, '@fission-ai/openspec');
});

test('it never invokes the squatted bare package name', async () => {
  await withTmpDir(async (root) => {
    const exec = fakeExec();
    await runOpenspec(root, await fx('h0-requirements.json'), await fx('h0-architecture.json'), { exec });
    // Deliberately checked against the hardcoded string, not the imported OPENSPEC_PACKAGE
    // constant: if the constant itself were ever redefined as the squatted bare name, stripping
    // it via the constant would erase the very evidence this test exists to catch.
    const REAL_PACKAGE = '@fission-ai/openspec';
    for (const call of exec.calls) {
      assert.ok(!/\bopenspec\b(?!\/)/.test(call.replace(REAL_PACKAGE, '')),
        `bare "openspec" was invoked: ${call} — the bare npm name is a squatted 0.0.0 stub`);
    }
    assert.ok(exec.calls.some((c) => c.includes(REAL_PACKAGE)));
  });
});

test('it writes one proposal per must-have feature, at the exact declared paths', async () => {
  await withTmpDir(async (root) => {
    const r = await fx('h0-requirements.json');
    const res = await runOpenspec(root, r, await fx('h0-architecture.json'), { exec: fakeExec() });
    assert.equal(res.status, 'written');
    const musts = r.features.filter((f) => f.priority === 'must');
    // Exact expected paths, not a substring match — a wrong prefix (e.g. bogus/<slug>/proposal.md)
    // would still satisfy `.includes(slug)` but must not satisfy this. This matters concretely:
    // Task 23's applySpec flattens this array directly into the dry-run consent preview shown to
    // the user, so a wrong path here would display as if it were real.
    assert.deepEqual(
      res.artifacts,
      musts.map((f) => `openspec/changes/${f.slug}/proposal.md`),
    );
    for (const f of musts) {
      const body = await readFile(path.join(root, 'openspec/changes', f.slug, 'proposal.md'), 'utf8');
      assert.ok(body.includes(f.title));
    }
  });
});

test('a should-priority feature gets no proposal, on disk or in artifacts', async () => {
  await withTmpDir(async (root) => {
    // The shared fixture has exactly two features and both are 'must', so it cannot prove the
    // priority filter actually excludes anything — a filter replaced with "keep everything"
    // would still pass against it. This inline fixture supplies the missing negative case
    // without touching the shared fixture that 654 other tests depend on.
    const requirements = {
      schema_version: 1,
      features: [
        {
          id: 'F1', slug: 'must-feature', title: 'A must-have feature', priority: 'must',
          component_refs: [],
          user_story: { as_a: 'a user', i_want: 'this feature', so_that: 'it works' },
          requirements: [{ id: 'FR-1.1', statement: 'It must work.' }],
          scenarios: [{ id: 'FR-1.1-S1', name: 'It works', requirement_ref: 'FR-1.1',
            given: ['a precondition'], when: ['an action'], then: ['a result'] }],
        },
        {
          id: 'F2', slug: 'should-feature', title: 'A should-have feature', priority: 'should',
          component_refs: [],
          user_story: { as_a: 'a user', i_want: 'a nice-to-have', so_that: 'it is nicer' },
          requirements: [{ id: 'FR-2.1', statement: 'It should work.' }],
          scenarios: [],
        },
      ],
      non_functional: [],
    };
    const res = await runOpenspec(root, requirements, await fx('h0-architecture.json'), { exec: fakeExec() });
    assert.deepEqual(res.artifacts, ['openspec/changes/must-feature/proposal.md']);
    assert.ok(!res.artifacts.some((a) => a.includes('should-feature')));
    const written = await access(path.join(root, 'openspec/changes/should-feature')).then(() => true).catch(() => false);
    assert.equal(written, false, 'a should-priority feature must not get a proposal on disk');
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
    assert.ok(first.cwds.includes(root), `init must run with cwd: root, got cwds: ${JSON.stringify(first.cwds)}`);

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
  const feature = r.features[0];
  const md = renderProposal(feature, arch);
  for (const heading of ['## Why', '## What changes', '## Verification']) {
    assert.ok(md.includes(heading), `proposal is missing ${heading}`);
  }

  const why = section(md, '## Why');
  assert.ok(why.includes(feature.user_story.i_want),
    'the Why section must actually explain the user story, not just exist');

  const whatChanges = section(md, '## What changes');
  for (const req of feature.requirements) {
    assert.ok(whatChanges.includes(req.id), `${req.id} is missing from What changes`);
    assert.ok(whatChanges.includes(req.statement),
      `the requirement's actual statement text ("${req.statement}") is missing from What changes — ` +
      'an id with no statement is not a usable proposal');
  }

  // At least one component drawn from the architecture (matched via component_refs) must
  // contribute real prose, not just the id — otherwise the entire `architecture` argument could
  // be deleted from the implementation and no test would notice.
  const refs = new Set(feature.component_refs ?? []);
  const components = (arch.components ?? []).filter((c) => refs.has(c.id));
  assert.ok(components.length > 0, 'fixture must exercise at least one referenced component');
  for (const c of components) {
    assert.ok(whatChanges.includes(c.label) || whatChanges.includes(c.what_it_does),
      `component ${c.id}'s label/what_it_does is missing from What changes — architecture content is not reaching the proposal`);
  }

  const verification = section(md, '## Verification');
  for (const s of feature.scenarios) {
    assert.ok(verification.includes(s.id), `${s.id} is missing from Verification`);
    assert.ok(verification.includes(s.name),
      `the scenario's actual name ("${s.name}") is missing from Verification — an id with no name is not useful`);
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
