import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectTargets, applyShip } from '../../scripts/lib/ship-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('selectTargets picks vercel for a next-monolith frontend slot by default', async () => {
  const stack = await fixture('h0-stack.json');
  const targets = selectTargets({ ...stack, repo_shape: 'next-monolith' });
  const frontend = targets.find((t) => t.kind === 'frontend');
  assert.equal(frontend.target, 'vercel');
});

test('selectTargets honors a required slot naming a specific cloud, sponsor-wins', async () => {
  const stack = await fixture('h0-stack.json');
  // h0-stack.json's slots[0] is "database", which deployableSlots() (Task 7, unmodified
  // here) deliberately excludes -- see deploy-schema.test.mjs's "only the database slot is
  // excluded" case. selectTargets is specified to reuse that same filter, so a slot the
  // filter drops can never reach the sponsor-wins check. slots[1] ("deploy") is a
  // deployable slot, so it exercises the sponsor-wins branch this test is actually about.
  stack.slots[1] = { ...stack.slots[1], source: 'required', choice: 'AWS App Runner' };
  const targets = selectTargets(stack);
  assert.equal(targets.find((t) => t.slotId === stack.slots[1].id).target, 'aws');
});

async function seededProject(root, extra = {}) {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.project = { name: 'x', selected_idea: 'i-1', ...extra };
  state.phases.stack.status = 'approved';
  await writeState(root, state);
}

test('applyShip refuses to run before :stack is approved', async () => {
  await withTmpDir(async (root) => {
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.project = { name: 'x', selected_idea: 'i-1' };
    await writeState(root, state); // stack.status stays not_started
    const deploy = await fixture('h0-deploy.json');
    await assert.rejects(() => applyShip(root, deploy, {}), /:stack.*approved/i);
  });
});

test('applyShip writes deploy.json, sets project.deploy digest, and gates the phase', async () => {
  await withTmpDir(async (root) => {
    await seededProject(root);
    const deploy = await fixture('h0-deploy.json');
    const { artifacts } = await applyShip(root, deploy, { stamp: '2026-08-30T20-00-00Z' });
    assert.deepEqual(artifacts, ['.hackathon/deploy.json']);

    const written = JSON.parse(await readFile(new URL(`file://${root}/.hackathon/deploy.json`), 'utf8'));
    assert.deepEqual(written, deploy);

    const state = await readState(root);
    assert.equal(state.project.deploy.primary_url, deploy.services[0].url);
    assert.equal(state.project.deploy.ref, '.hackathon/deploy.json');
    assert.equal(state.phases.ship.status, 'awaiting_approval');
  });
});

test('applyShip dry run writes nothing', async () => {
  await withTmpDir(async (root) => {
    await seededProject(root);
    const deploy = await fixture('h0-deploy.json');
    const result = await applyShip(root, deploy, { dryRun: true });
    assert.deepEqual(result.artifacts, ['.hackathon/deploy.json']);
    await assert.rejects(() => readFile(new URL(`file://${root}/.hackathon/deploy.json`)));
  });
});

test('applyShip refuses an invalid deploy payload', async () => {
  await withTmpDir(async (root) => {
    await seededProject(root);
    await assert.rejects(() => applyShip(root, { services: [] }, {}), /refusing to apply/);
  });
});
