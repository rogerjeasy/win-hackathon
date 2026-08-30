import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import {
  buildHackathonDigest, nextActionDeadline, buildSubmissionDeliverables, applyRecon,
} from '../../scripts/lib/recon-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState, validateState } from '../../scripts/lib/schema.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

const BEFORE_EVERYTHING = new Date('2026-06-05T00:00:00Z');

test('nextActionDeadline picks the soonest action date still ahead of us', async () => {
  const r = await golden();
  const next = nextActionDeadline(r.dates, BEFORE_EVERYTHING);
  assert.equal(next.label, 'credit request form closes');
  assert.equal(next.at, '2026-06-26T12:00:00-07:00');
});

test('nextActionDeadline ignores hard and informational dates', async () => {
  const r = await golden();
  const next = nextActionDeadline(r.dates, BEFORE_EVERYTHING);
  assert.notEqual(next.at, '2026-06-29T17:00:00-07:00', 'the submission deadline is not an action');
});

test('nextActionDeadline returns null once every action date has passed', async () => {
  const r = await golden();
  assert.equal(nextActionDeadline(r.dates, new Date('2026-06-28T00:00:00Z')), null);
});

test('nextActionDeadline returns null when there are no action dates', () => {
  assert.equal(nextActionDeadline([{ label: 'x', at: '2026-06-29T17:00:00-07:00', kind: 'hard' }], BEFORE_EVERYTHING), null);
});

test('the digest carries the hard deadline, tiebreak, and criteria in rank order', async () => {
  const d = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  assert.equal(d.deadline, '2026-06-29T17:00:00-07:00');
  assert.equal(d.tiebreak, 'listed_order');
  assert.deepEqual(d.criteria_ids, ['technical-implementation', 'design', 'impact', 'originality']);
});

test('the digest carries required tech as flat strings the hook can print', async () => {
  const d = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  assert.ok(d.tech.required.every((t) => typeof t === 'string'));
  assert.ok(d.tech.required.some((t) => /Aurora PostgreSQL/.test(t)));
});

test('the digest starts with no track selected', async () => {
  const d = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  assert.equal(d.selected_track, null, 'track is chosen at :describe, not :recon');
});

test('the digest records the bonus ceiling', async () => {
  const d = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  assert.equal(d.bonus_points_available, 0.6);
});

test('the digest reports zero bonus when the hackathon offers none', async () => {
  const r = await golden();
  delete r.bonus;
  const d = buildHackathonDigest(r, { now: BEFORE_EVERYTHING });
  assert.equal(d.bonus_points_available, 0);
});

test('the digest passes state validation', async () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  const { valid, errors } = validateState(s);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('deliverables are seeded from hard submission requirements only', async () => {
  const r = await golden();
  r.submission_requirements.push({ id: 'optional-thing', hard: false, requirement: 'x' });
  const d = buildSubmissionDeliverables(r);
  assert.ok(d.every((x) => x.status === 'not_started'));
  assert.ok(d.some((x) => x.id === 'demo-video'));
  assert.ok(!d.some((x) => x.id === 'optional-thing'), 'optional elements are not tracked as required');
});

test('applyRecon writes the three artifacts and a valid state', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const result = await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });

    assert.deepEqual(result.artifacts.sort(), [
      '.hackathon/brief.md', '.hackathon/criteria.md', '.hackathon/recon.json', '.hackathon/rules.md',
    ]);
    for (const rel of result.artifacts) {
      const body = await readFile(path.join(dir, rel), 'utf8');
      assert.ok(body.length > 0, `${rel} is empty`);
    }

    const state = await readState(dir);
    assert.equal(state.hackathon.name, 'H0: Hack the Zero Stack with Vercel v0 and AWS Databases');
    assert.equal(state.deliverables.submission_requirements.length, 6);
  });
});

test('applyRecon records the artifacts on the recon phase so drift detection covers them', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });
    const state = await readState(dir);
    assert.ok(state.phases.recon.artifacts.includes('.hackathon/recon.json'));
    assert.equal(state.phases.recon.status, 'awaiting_approval', 'the gate is at the phase exit');
  });
});

test('applyRecon refuses an invalid payload rather than writing a partial one', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const bad = await golden();
    bad.dates[0].at = 'June 29';
    await assert.rejects(() => applyRecon(dir, bad, { now: BEFORE_EVERYTHING }), /offset/);

    const state = await readState(dir);
    assert.equal(state.hackathon, null, 'nothing was written');
  });
});

test('applyRecon migrates a v1 state on the way through', async () => {
  await withTmpDir(async (dir) => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    const v1 = createDefaultState({ pluginVersion: '0.1.0' });
    delete v1.deliverables;
    v1.schema_version = 1;
    await writeFile(path.join(dir, '.hackathon/state.json'), JSON.stringify(v1), 'utf8');

    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });
    const state = await readState(dir);
    assert.equal(state.schema_version, 4);
    assert.equal(state.deliverables.submission_requirements.length, 6);
  });
});

test('applyRecon is idempotent — re-running replaces rather than duplicating', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });
    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });
    const state = await readState(dir);
    assert.equal(state.deliverables.submission_requirements.length, 6);
    assert.equal(state.phases.recon.artifacts.length, 4);
  });
});

test('buildHackathonDigest stamps started_at from the injected clock', async () => {
  const digest = buildHackathonDigest(await golden(), { now: BEFORE_EVERYTHING });
  assert.equal(digest.started_at, BEFORE_EVERYTHING.toISOString());
});

test('applyRecon preserves started_at across a re-run (regression)', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const first = new Date('2026-06-05T00:00:00Z');
    await applyRecon(dir, await golden(), { now: first });
    const afterFirst = await readState(dir);
    assert.equal(afterFirst.hackathon.started_at, first.toISOString());

    const later = new Date('2026-06-20T00:00:00Z');
    await applyRecon(dir, await golden(), { now: later });
    const afterSecond = await readState(dir);
    assert.equal(
      afterSecond.hackathon.started_at,
      first.toISOString(),
      're-running :recon must not reset the budget clock\'s origin point',
    );
  });
});

test('applyRecon preserves a deliverable already marked done', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });

    const state = await readState(dir);
    const video = state.deliverables.submission_requirements.find((d) => d.id === 'demo-video');
    video.status = 'done';
    await writeState(dir, state);

    await applyRecon(dir, await golden(), { now: BEFORE_EVERYTHING });
    const after = await readState(dir);
    assert.equal(
      after.deliverables.submission_requirements.find((d) => d.id === 'demo-video').status,
      'done',
      're-running recon must not reset progress the user already made',
    );
  });
});
