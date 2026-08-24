import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDefaultState } from '../scripts/lib/schema.mjs';
import { writeState, readState } from '../scripts/lib/state.mjs';
import { applyStack } from '../scripts/lib/stack-apply.mjs';
import { applyArchitecture } from '../scripts/lib/architect-apply.mjs';
import { resolveNext } from '../scripts/lib/resolve-next.mjs';
import { withTmpDir } from './helpers/tmp.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`fixtures/${n}`, import.meta.url), 'utf8'));

async function approve(root, phase) {
  const s = await readState(root);
  s.phases[phase].status = 'approved';
  await writeState(root, s);
}

test('stack then architect, from a clean project, ends approved with no drift', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
    await writeState(root, s);

    await applyStack(root, await fx('h0-stack.json'), { recon: await fx('h0-recon.json') });
    let next = await resolveNext(root);
    assert.equal(next.outcome, 'awaiting_approval');
    assert.equal(next.phase, 'stack');
    await approve(root, 'stack');

    await applyArchitecture(root, await fx('h0-architecture.json'), { stack: await fx('h0-stack.json') });
    await approve(root, 'architect');

    next = await resolveNext(root);
    assert.equal(next.outcome, 'start');
    assert.equal(next.phase, 'requirements', 'the resolver should now point at the next unbuilt phase');
    assert.deepEqual(next.drift, []);
  });
});

test('deleting a rendered artifact makes :next report drift with no new resolver code', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
    await writeState(root, s);

    await applyStack(root, await fx('h0-stack.json'), { recon: await fx('h0-recon.json') });
    await approve(root, 'stack');
    await applyArchitecture(root, await fx('h0-architecture.json'), { stack: await fx('h0-stack.json') });
    await approve(root, 'architect');

    const { rm } = await import('node:fs/promises');
    await rm(path.join(root, 'docs/architecture.md'));

    const next = await resolveNext(root);
    assert.equal(next.outcome, 'drift');
    assert.equal(next.phase, 'architect');
    assert.ok(next.drift[0].missing.includes('docs/architecture.md'));
  });
});

test('all ten :architect artifacts land on disk', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
    await writeState(root, s);

    await applyStack(root, await fx('h0-stack.json'), { recon: await fx('h0-recon.json') });
    await approve(root, 'stack');
    const { artifacts } = await applyArchitecture(
      root, await fx('h0-architecture.json'), { stack: await fx('h0-stack.json') },
    );

    assert.equal(artifacts.length, 8, 'architect declares all eight of its own outputs');
    for (const rel of artifacts) {
      await assert.doesNotReject(readFile(path.join(root, rel)), `${rel} was declared but not written`);
    }

    const stackState = await readState(root);
    const allArtifacts = [...(stackState.phases.stack.artifacts ?? []), ...artifacts];
    assert.equal(allArtifacts.length, 10, 'stack (2) + architect (8) = all ten Stage 1 artifacts');
    for (const rel of allArtifacts) {
      await assert.doesNotReject(readFile(path.join(root, rel)), `${rel} was declared but not written`);
    }
  });
});

test('the three diagram renderings agree on every component', async () => {
  await withTmpDir(async (root) => {
    const s = createDefaultState({ pluginVersion: '0.1.0' });
    s.project = { name: 'Kintwadi', selected_idea: 'i1' };
    for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
    await writeState(root, s);

    await applyStack(root, await fx('h0-stack.json'), { recon: await fx('h0-recon.json') });
    await approve(root, 'stack');
    await applyArchitecture(root, await fx('h0-architecture.json'), { stack: await fx('h0-stack.json') });

    const architecture = await fx('h0-architecture.json');
    const [mmd, svg, drawio] = await Promise.all([
      readFile(path.join(root, 'docs/assets/architecture.mmd'), 'utf8'),
      readFile(path.join(root, 'docs/assets/architecture.svg'), 'utf8'),
      readFile(path.join(root, 'docs/assets/architecture.drawio'), 'utf8'),
    ]);

    for (const c of architecture.components) {
      assert.ok(mmd.includes(c.label), `architecture.mmd is missing "${c.label}"`);
      assert.ok(svg.includes(c.label), `architecture.svg is missing "${c.label}"`);
      assert.ok(drawio.includes(c.label), `architecture.drawio is missing "${c.label}"`);
    }
  });
});
