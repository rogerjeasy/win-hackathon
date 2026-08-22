import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import {
  buildHeadingPlan, buildBonusPlan, renderStrategySkeleton, applyDescribe,
} from '../../scripts/lib/describe-apply.mjs';
import { TIEBREAK_MARKER } from '../../scripts/lib/render-artifacts.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

async function load(name) {
  const raw = await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  return JSON.parse(raw);
}
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

/** A project mid-flight: init done, recon applied, an idea chosen. */
async function seeded(dir) {
  await mkdir(path.join(dir, '.hackathon'), { recursive: true });
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  await writeFile(path.join(dir, '.hackathon/recon.json'), JSON.stringify(recon), 'utf8');
  await writeFile(path.join(dir, '.hackathon/ideas.json'), JSON.stringify(ideas), 'utf8');

  const state = createDefaultState({ pluginVersion: '0.1.0' });
  state.hackathon = {
    name: recon.identity.name, url: recon.source.url,
    deadline: '2026-06-29T17:00:00-07:00', next_action_deadline: null,
    tech: { required: ['AWS Database'], bonus: [], forbidden: [] },
    criteria_ids: recon.criteria.items.map((c) => c.id),
    tiebreak: 'listed_order', bonus_points_available: 0.6,
    selected_track: null, recon_ref: '.hackathon/recon.json',
  };
  state.phases.recon = { status: 'approved', artifacts: ['.hackathon/recon.json'] };
  state.phases.brainstorm = { status: 'approved', artifacts: ['.hackathon/ideas.json'], rounds: 1 };
  await writeState(dir, state);
  return { recon, ideas };
}

test('the heading plan covers every judging criterion', async () => {
  const recon = await load('h0-recon.json');
  const plan = buildHeadingPlan(recon);
  assert.deepEqual(
    plan.map((p) => p.criterion_id).sort(),
    recon.criteria.items.map((c) => c.id).sort(),
  );
});

test('the heading plan marks which headings are insertions beyond the Devpost defaults', async () => {
  const recon = await load('h0-recon.json');
  const plan = buildHeadingPlan(recon);
  // Winners insert headings into the default seven; you can only plan an insertion
  // if you know the baseline.
  assert.ok(plan.some((p) => p.inserted === true));
  const defaults = recon.submission_form.fields.find((f) => f.id === 'about').default_headings;
  for (const p of plan.filter((x) => x.inserted === false)) {
    assert.ok(defaults.includes(p.heading), `${p.heading} claims to be a default but is not one`);
  }
});

test('the heading plan degrades gracefully with no submission_form', async () => {
  const recon = await load('h0-recon.json');
  delete recon.submission_form;
  const plan = buildHeadingPlan(recon);
  assert.equal(plan.length, recon.criteria.items.length);
  assert.ok(plan.every((p) => p.inserted === true), 'with no known baseline, everything is an insertion');
});

test('the bonus plan opens one slot per available bonus point', async () => {
  const recon = await load('h0-recon.json');
  const plan = buildBonusPlan(recon);
  assert.equal(plan.length, 3, '0.6 max at 0.2 each');
  assert.ok(plan.every((p) => p.status === 'not_started'));
  assert.ok(plan.every((p) => p.url === null));
});

test('the bonus plan is empty when the hackathon offers no bonus', async () => {
  const recon = await load('h0-recon.json');
  delete recon.bonus;
  assert.deepEqual(buildBonusPlan(recon), []);
});

test('the bonus plan ids are unique and stable', async () => {
  const recon = await load('h0-recon.json');
  const a = buildBonusPlan(recon).map((p) => p.id);
  const b = buildBonusPlan(recon).map((p) => p.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('the strategy skeleton embeds the criteria map with the tiebreak marked', async () => {
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  const out = renderStrategySkeleton({ recon, idea: ideas.ideas[0] });
  assert.ok(out.includes(TIEBREAK_MARKER));
  for (const c of recon.criteria.items) assert.ok(out.includes(c.name), `missing ${c.name}`);
});

test('the strategy skeleton carries the thesis from the chosen idea', async () => {
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  const out = renderStrategySkeleton({ recon, idea: ideas.ideas[0] });
  assert.ok(out.includes(ideas.ideas[0].thesis));
  assert.ok(out.includes(ideas.ideas[0].demo_moment));
});

test('the strategy skeleton states the heading placement rule', async () => {
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  const out = renderStrategySkeleton({ recon, idea: ideas.ideas[0] });
  // The finding that separated the $10,000 track winners from the $2,000 category prize.
  assert.match(out, /top-level heading/i);
});

test('the strategy skeleton includes the bonus plan and its disclosure requirement', async () => {
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  const out = renderStrategySkeleton({ recon, idea: ideas.ideas[0] });
  assert.match(out, /#H0Hackathon/);
  assert.ok(out.includes(recon.bonus.required_disclosure));
});

test('the strategy skeleton does not let an embedded newline break out of the thesis blockquote', async () => {
  const recon = await load('h0-recon.json');
  const ideas = await load('h0-ideas.json');
  const idea = { ...ideas.ideas[0], thesis: 'Line one\n# Fake heading injected by the source data' };
  const out = renderStrategySkeleton({ recon, idea });
  // Every physical line contributed by the thesis must still be inside the blockquote.
  assert.ok(out.includes('> Line one'));
  assert.ok(out.includes('> # Fake heading injected by the source data'));
  assert.ok(!out.includes('\n# Fake heading injected by the source data'));
});

test('applyDescribe records the project name, track and bonus slots', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    const { artifacts, bonusSlots } = await applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' });

    assert.deepEqual(artifacts.sort(), ['.hackathon/project.md', '.hackathon/strategy.md']);
    assert.equal(bonusSlots, 3);

    const state = await readState(dir);
    assert.equal(state.project.name, 'CareCircle');
    assert.equal(state.project.selected_idea, 'idea-07');
    assert.equal(state.hackathon.selected_track, 'b2c');
    assert.equal(state.deliverables.bonus_content.length, 3);
    assert.equal(state.phases.describe.status, 'awaiting_approval');
  });
});

test('applyDescribe writes a strategy skeleton but leaves project.md for the author', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' });
    const strategy = await readFile(path.join(dir, '.hackathon/strategy.md'), 'utf8');
    const project = await readFile(path.join(dir, '.hackathon/project.md'), 'utf8');
    assert.match(strategy, /CareCircle/);
    // project.md is an outline the agent fills with prose; the section spine is fixed
    // so later phases know where to look.
    assert.match(project, /Why now/i);
    assert.match(project, /day in the life/i);
    assert.match(project, /Out of scope/i);
  });
});

test('applyDescribe rejects an unknown idea id', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-99', trackId: 'b2c' }),
      /idea-99/,
    );
    assert.equal(await exists(path.join(dir, '.hackathon/strategy.md')), false);
  });
});

test('applyDescribe rejects a disqualified idea', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-03', trackId: 'b2c' }),
      /disqualified/i,
    );
  });
});

test('applyDescribe rejects a track the hackathon does not have', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-07', trackId: 'enterprise' }),
      /enterprise/,
    );
  });
});

test('applyDescribe preserves a bonus piece already published', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' });

    const state = await readState(dir);
    state.deliverables.bonus_content[0].status = 'done';
    state.deliverables.bonus_content[0].url = 'https://dev.to/example';
    await writeState(dir, state);

    await applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2b' });
    const after = await readState(dir);
    assert.equal(after.deliverables.bonus_content[0].status, 'done');
    assert.equal(after.deliverables.bonus_content[0].url, 'https://dev.to/example');
    assert.equal(after.hackathon.selected_track, 'b2b', 'the track may still be changed');
  });
});

test('applyDescribe requires recon to have run', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' }),
      /recon/i,
    );
  });
});

test('applyDescribe rejects loudly when recon.json exists but is corrupt, and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await writeFile(path.join(dir, '.hackathon/recon.json'), '{ not valid json', 'utf8');

    // Must be the loud parse failure, not the "run recon first" hint that would be
    // truthful only if the file were actually absent (ENOENT), and not merely
    // "something threw" — a corrupt-but-present file is a different failure than
    // a missing one and must be reported as such.
    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' }),
      /recon\.json could not be parsed as JSON/,
    );
    assert.equal(await exists(path.join(dir, '.hackathon/strategy.md')), false);
    assert.equal(await exists(path.join(dir, '.hackathon/project.md')), false);
  });
});

test('applyDescribe rejects loudly when ideas.json exists but is corrupt, and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seeded(dir);
    await writeFile(path.join(dir, '.hackathon/ideas.json'), '{ not valid json', 'utf8');

    await assert.rejects(
      () => applyDescribe(dir, { ideaId: 'idea-07', trackId: 'b2c' }),
      /ideas\.json could not be parsed as JSON/,
    );
    assert.equal(await exists(path.join(dir, '.hackathon/strategy.md')), false);
    assert.equal(await exists(path.join(dir, '.hackathon/project.md')), false);
  });
});
