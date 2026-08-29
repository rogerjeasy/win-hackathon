import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultState } from '../scripts/lib/schema.mjs';
import { writeState, readState } from '../scripts/lib/state.mjs';
import { applyStack } from '../scripts/lib/stack-apply.mjs';
import { applyArchitecture } from '../scripts/lib/architect-apply.mjs';
import { applyRequirements } from '../scripts/lib/requirements-apply.mjs';
import { applySpec } from '../scripts/lib/spec-apply.mjs';
import { resolveNext } from '../scripts/lib/resolve-next.mjs';
import { withTmpDir } from './helpers/tmp.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`fixtures/${n}`, import.meta.url), 'utf8'));
const okExec = async () => ({ code: 0, stdout: '', stderr: '' });

// `body.includes('FR-1.1')` alone is fooled by the scenario id `FR-1.1-S1`, which every
// surface also prints and which carries the FR id as a mere prefix — that would pass even
// if a surface silently stopped rendering the FR id itself. The negative lookahead refuses
// a match immediately followed by `-`, so only the FR id rendered on its own (as every real
// call site renders it — `**FR-1.1**`, `satisfies FR-1.1`) counts.
function carriesFrId(body, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?!-)`).test(body);
}

async function approve(root, phase) {
  const s = await readState(root);
  s.phases[phase].status = 'approved';
  await writeState(root, s);
}

async function walk(root, { exec = okExec } = {}) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
  await writeState(root, s);

  const [recon, stack, architecture, requirements] = await Promise.all([
    fx('h0-recon.json'), fx('h0-stack.json'), fx('h0-architecture.json'), fx('h0-requirements.json'),
  ]);

  await applyStack(root, stack, { recon });
  await approve(root, 'stack');
  await applyArchitecture(root, architecture, { stack });
  await approve(root, 'architect');
  await applyRequirements(root, requirements, { recon, architecture });
  await approve(root, 'requirements');
  const spec = await applySpec(root, { requirements, architecture, exec });
  await approve(root, 'spec');
  return spec;
}

test('all four phases run in order from a clean project', async () => {
  await withTmpDir(async (root) => {
    await walk(root);
    const next = await resolveNext(root);
    assert.equal(next.outcome, 'start');
    assert.equal(next.phase, 'build', 'M3 ends exactly where M4 begins');
    assert.deepEqual(next.drift, []);
  });
});

test('one FR id travels intact into all four spec surfaces', async () => {
  await withTmpDir(async (root) => {
    await walk(root);
    const target = 'FR-1.1';
    const [frTable, gherkin, kiro, proposal] = await Promise.all([
      readFile(path.join(root, '.hackathon/requirements.md'), 'utf8'),
      readFile(path.join(root, 'features/shared-care-record.feature'), 'utf8'),
      readFile(path.join(root, '.hackathon/specs/0001-shared-care-record/requirements.md'), 'utf8'),
      readFile(path.join(root, 'openspec/changes/shared-care-record/proposal.md'), 'utf8'),
    ]);
    for (const [name, body] of [['FR table', frTable], ['gherkin', gherkin],
      ['kiro', kiro], ['proposal', proposal]]) {
      assert.ok(carriesFrId(body, target), `${target} did not reach the ${name} surface`);
    }
  });
});

test('an unreachable OpenSpec leaves the other three surfaces complete', async () => {
  await withTmpDir(async (root) => {
    const architecture = await fx('h0-architecture.json');
    const spec = await walk(root, { exec: async () => ({ code: 127, stdout: '', stderr: 'not found' }) });
    assert.equal(spec.openspec.status, 'deferred');

    const target = 'FR-1.1';
    const [frTable, gherkin, design] = await Promise.all([
      readFile(path.join(root, '.hackathon/requirements.md'), 'utf8'),
      readFile(path.join(root, 'features/shared-care-record.feature'), 'utf8'),
      readFile(path.join(root, '.hackathon/specs/0001-shared-care-record/design.md'), 'utf8'),
    ]);
    // A bare `assert.ok(await readFile(...))` only proves the file is non-empty — a
    // placeholder string would satisfy it just as well as the real render. Check for the
    // actual content each surface is supposed to carry instead.
    assert.ok(carriesFrId(frTable, target), 'FR table did not survive a deferred OpenSpec');
    assert.ok(carriesFrId(gherkin, target), 'gherkin did not survive a deferred OpenSpec');
    // design.md carries no FR ids by construction (emit-kiro.mjs's kiroDesign works from
    // components and invariants, not requirement ids) — its substance is the component
    // slice and the invariants a build agent must uphold, so check those instead.
    for (const c of architecture.components) {
      assert.ok(design.includes(c.label), `design.md is missing component "${c.label}"`);
    }
    assert.ok(
      design.includes('dal-only-tenant-access'),
      'design.md is missing the invariant FR-1.1 upholds',
    );

    const next = await resolveNext(root);
    assert.equal(next.outcome, 'start', 'a deferred optional tool must not leave the pipeline stuck');
  });
});

test('a criterion with no feature stops the pipeline at :requirements', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'K', selected_idea: 'i1' };
    await writeState(root, s);
    const recon = await fx('h0-recon.json');
    const requirements = await fx('h0-requirements.json');
    const orphan = recon.criteria.items.at(-1).id;
    for (const f of requirements.features) {
      f.criterion_refs = f.criterion_refs.filter((c) => c !== orphan);
    }
    const architecture = await fx('h0-architecture.json');
    await assert.rejects(
      () => applyRequirements(root, requirements, { recon, architecture }),
      /refusing to apply/,
    );
  });
});
