import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, readFile as readFileText } from 'node:fs/promises';
import path from 'node:path';
import {
  remainingHours, phaseBudgetOutstanding, cutCandidates, rankCutCandidates, applyPivot,
} from '../../scripts/lib/pivot-apply.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { mustHaveFeatures } from '../../scripts/lib/build-apply.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('remainingHours computes from hackathon.deadline and an injected now', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.hackathon = { name: 'x', deadline: '2026-09-01T00:00:00Z' };
  const hours = remainingHours(state, { now: new Date('2026-08-30T00:00:00Z') });
  assert.equal(hours, 48);
});

test('remainingHours is null with no deadline', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(remainingHours(state, { now: new Date() }), null);
});

test('phaseBudgetOutstanding sums only phases not approved or skipped', () => {
  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.budget.phase_budget = { build: 20, ship: 4, review: 3 };
  state.phases.build.status = 'approved';
  assert.equal(phaseBudgetOutstanding(state), 7); // ship + review, build excluded
});

async function scaffold(root) {
  const requirements = await fixture('h0-requirements.json');
  for (const f of mustHaveFeatures(requirements)) {
    await mkdir(path.join(root, '.hackathon', 'specs', f.dir), { recursive: true });
    await writeFile(path.join(root, '.hackathon', 'specs', f.dir, 'tasks.md'), '- [ ] not done\n', 'utf8');
  }
  return requirements;
}

test('cutCandidates flags a feature as neverPropose when it is the sole claim on a criterion', async () => {
  await withTmpDir(async (root) => {
    const requirements = await scaffold(root);
    const candidates = await cutCandidates(root, requirements, []);
    const ranked = rankCutCandidates(candidates);
    const soleClaimants = requirements.features.filter((f) => f.priority === 'must'
      && (f.criterion_refs ?? []).some((ref) =>
        requirements.features.filter((g) => (g.criterion_refs ?? []).includes(ref)).length === 1));
    for (const f of soleClaimants) {
      const entry = ranked.find((c) => c.slug === f.slug);
      assert.equal(entry.neverPropose, true, `${f.slug} claims a criterion alone and must be flagged`);
    }
  });
});

test('rankCutCandidates orders safe-to-cut before neverPropose', async () => {
  await withTmpDir(async (root) => {
    const requirements = await scaffold(root);
    const ranked = rankCutCandidates(await cutCandidates(root, requirements, []));
    const firstNeverProposeIdx = ranked.findIndex((c) => c.neverPropose);
    if (firstNeverProposeIdx !== -1) {
      assert.ok(ranked.slice(0, firstNeverProposeIdx).every((c) => !c.neverPropose));
    }
  });
});

test('a must-have that shares its criterion with a should-have is still never-propose (should-have coverage does not guarantee anything)', async () => {
  await withTmpDir(async (root) => {
    const base = await fixture('h0-requirements.json');
    const requirements = {
      ...base,
      features: [
        ...base.features,
        {
          id: 'F3', slug: 'nice-to-have-widget', title: 'A nice-to-have widget',
          priority: 'should',
          // Shares 'technical-implementation' with F1 (must) -- a should-have claim
          // does not guarantee the criterion stays covered, so it must not exempt
          // the must-have from being flagged as a sole (must-only) claimant.
          criterion_refs: ['technical-implementation'],
          requirements: [{ id: 'FR-3.1', statement: 'placeholder' }],
        },
      ],
    };
    for (const f of mustHaveFeatures(requirements)) {
      await mkdir(path.join(root, '.hackathon', 'specs', f.dir), { recursive: true });
      await writeFile(path.join(root, '.hackathon', 'specs', f.dir, 'tasks.md'), '- [ ] not done\n', 'utf8');
    }

    const ranked = rankCutCandidates(await cutCandidates(root, requirements, []));
    const f1 = ranked.find((c) => c.slug === 'shared-care-record');
    assert.equal(f1.soleClaim, true, 'F1 is still the sole MUST claimant on technical-implementation');
    assert.equal(f1.neverPropose, true, 'a should-have sharing the criterion must not exempt F1 from protection');
  });
});

test('applyPivot appends to cut_features (deduplicated) and writes decisions.md, never touching requirements.json', async () => {
  await withTmpDir(async (root) => {
    const requirements = await scaffold(root);
    const before = JSON.stringify(requirements);
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.project = { name: 'x', selected_idea: 'i-1', cut_features: ['FR-01.1'] };
    await writeState(root, state);

    await applyPivot(root, ['FR-01.1', 'FR-02.1'], 'Cutting FR-02.1: deadline pressure, not the sole claim on any criterion.',
      { now: new Date('2026-08-30T20:00:00Z') });

    const next = await readState(root);
    assert.deepEqual(next.project.cut_features, ['FR-01.1', 'FR-02.1']);

    const decisions = await readFileText(path.join(root, '.hackathon', 'decisions.md'), 'utf8');
    assert.match(decisions, /FR-02\.1/);
    assert.match(decisions, /2026-08-30/);

    assert.equal(JSON.stringify(requirements), before);
  });
});
