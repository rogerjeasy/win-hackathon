# win-hackathon M2 (Front Half) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `:recon`, `:brainstorm` and `:describe` — the front half of the workflow — so that a Devpost URL goes in and a scored idea shortlist plus a written win strategy come out.

**Architecture:** Every judgment phase emits a **validated JSON payload** first (`recon.json`, `ideas.json`); the markdown artifacts are rendered from it. This is M1's `schema.mjs` pattern — refuse to write what does not validate — applied to domain data instead of orchestration state. Validators are pure functions in `scripts/lib/*-schema.mjs`; renderers are pure functions in `scripts/lib/render-artifacts.mjs`; the CLI entry points in `scripts/*.mjs` stay thin, mirroring M1's planner/applier split. Judgment (fetching pages, generating ideas, writing prose) lives in the markdown commands and agents.

**Tech Stack:** Node.js ≥ 20 (ESM, `node:test`, `node:assert/strict`), no runtime dependencies.

**Spec:** `docs/design/m2-front-half.md` (all sections); parent design `docs/design/win-hackathon-plugin.md` (§§ 3, 4, 8, 10, 12)

## Global Constraints

- **Node ≥ 20.** ESM (`.mjs`), `node:test`, `node:assert/strict`. No transpilation.
- **Zero runtime dependencies.** `package.json` may declare no `dependencies`.
- **`CURRENT_SCHEMA_VERSION = 2`** for `state.json`. `recon.json` and `ideas.json` each carry their own independent `schema_version: 1`.
- **All state writes are atomic** (write temp, then `rename`). Never bypass `writeState`.
- **Every `dates[].at` must be ISO 8601 with an explicit UTC offset.** Floating times are rejected. `Jun 30 @ 2:00am GMT+2` and `Jun 29 5:00pm PT` are the same instant; getting this wrong loses the hackathon outright.
- **Never guess.** A recon that cannot determine something records it in `unresolved` and completes; it does not invent a value.
- **Every extracted claim carries a verbatim `quote`.** A claim without a citation is unverified.
- **Gate before scoring.** An idea failing the Stage-One check belongs in `disqualified` and carries no scores. The validator enforces this — do not rely on the agent complying.
- **SessionStart hook output stays capped at 40 lines** and must exit 0 silently when `.hackathon/` is absent.
- Phase order is exactly: `recon, brainstorm, describe, stack, architect, requirements, spec, build, ship, review, submit`.
- Phase statuses are exactly: `not_started, in_progress, awaiting_approval, approved, skipped`.
- Deliverable statuses are exactly: `not_started, in_progress, done, skipped`.
- The existing field name `needate` in `preflight.mjs` is odd but internally consistent and tested. Leave it alone; renaming it is unrelated refactoring.

---

### Task 1: State schema v2, the ISO offset guard, and migration

**Files:**
- Create: `scripts/lib/iso-datetime.mjs`
- Modify: `scripts/lib/paths.mjs`
- Modify: `scripts/lib/schema.mjs`
- Modify: `scripts/lib/state.mjs`
- Test: `tests/lib/iso-datetime.test.mjs`
- Test: `tests/lib/schema.test.mjs` (extend)
- Test: `tests/lib/state.test.mjs` (extend)

**Interfaces:**
- Consumes: M1's `schema.mjs` (`CURRENT_SCHEMA_VERSION`, `createDefaultState`, `validateState`, `PHASE_STATUSES`), `state.mjs` (`readState`, `writeState`, `migrateState`), `paths.mjs` (`HACKATHON_DIR`, `PHASES`).
- Produces:
  - `hasExplicitOffset(value: string): boolean` from `iso-datetime.mjs`
  - `reconPath(root: string): string`, `ideasPath(root: string): string`, and constants `RECON_FILE`, `IDEAS_FILE` from `paths.mjs`
  - `DELIVERABLE_STATUSES: string[]` and `CURRENT_SCHEMA_VERSION === 2` from `schema.mjs`
  - `readRawState(root): Promise<object|null>` from `state.mjs` — parses without validating, so a v1 file can be migrated
  - `migrateStateFile(root): Promise<{migrated: boolean, from: number}>` from `state.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/iso-datetime.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExplicitOffset } from '../../scripts/lib/iso-datetime.mjs';

test('accepts an offset timestamp', () => {
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00-07:00'), true);
});

test('accepts a Z timestamp', () => {
  assert.equal(hasExplicitOffset('2026-06-30T00:00:00Z'), true);
});

test('accepts minute precision and fractional seconds', () => {
  assert.equal(hasExplicitOffset('2026-06-29T17:00-07:00'), true);
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00.500Z'), true);
});

test('rejects a floating time with no offset', () => {
  // The killer bug: "Jun 30 @ 2:00am GMT+2" and "Jun 29 5:00pm PT" are the same
  // instant. A timestamp without an offset silently means "whatever zone the
  // machine happens to be in", which is how a deadline gets missed.
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00'), false);
});

test('rejects a date with no time', () => {
  assert.equal(hasExplicitOffset('2026-06-29'), false);
});

test('rejects prose, empty strings, and non-strings', () => {
  assert.equal(hasExplicitOffset('June 29, 2026 5:00pm PT'), false);
  assert.equal(hasExplicitOffset(''), false);
  assert.equal(hasExplicitOffset(null), false);
  assert.equal(hasExplicitOffset(undefined), false);
  assert.equal(hasExplicitOffset(1750000000000), false);
});

test('rejects a well-formed but impossible date', () => {
  assert.equal(hasExplicitOffset('2026-02-30T10:00:00Z'), false);
});
```

Append to `tests/lib/schema.test.mjs`:

```js
import { CURRENT_SCHEMA_VERSION, DELIVERABLE_STATUSES, createDefaultState, validateState }
  from '../../scripts/lib/schema.mjs';

test('the current schema version is 2', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
});

test('a default state carries an empty deliverables block', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.deepEqual(s.deliverables, { submission_requirements: [], bonus_content: [] });
  assert.equal(validateState(s).valid, true);
});

test('validateState rejects a missing deliverables block', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  delete s.deliverables;
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /deliverables/.test(e)));
});

test('validateState rejects a deliverable with an unknown status', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.deliverables.submission_requirements = [{ id: 'demo-video', status: 'nearly' }];
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /nearly/.test(e)));
  assert.ok(DELIVERABLE_STATUSES.includes('not_started'));
});

test('validateState accepts a null hackathon (nothing reconned yet)', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  assert.equal(s.hackathon, null);
  assert.equal(validateState(s).valid, true);
});

test('validateState rejects a hackathon deadline without an explicit offset', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0', url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00',
    criteria_ids: ['technical-implementation'], tiebreak: 'listed_order',
  };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /offset/.test(e)));
});

test('validateState rejects an unknown tiebreak', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0', url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    criteria_ids: ['technical-implementation'], tiebreak: 'coin_flip',
  };
  const { valid, errors } = validateState(s);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /tiebreak/.test(e)));
});

test('validateState accepts a fully populated hackathon digest', () => {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0: Hack the Zero Stack',
    url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    next_action_deadline: { label: 'credit request form closes', at: '2026-06-26T12:00:00-07:00' },
    tech: { required: ['AWS Database'], bonus: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    tiebreak: 'listed_order',
    bonus_points_available: 0.6,
    selected_track: null,
    recon_ref: '.hackathon/recon.json',
  };
  assert.equal(validateState(s).valid, true);
});
```

Append to `tests/lib/state.test.mjs`. The file already imports `test`, `assert`,
`readFile`, `writeFile`, `mkdir`, `path`, `withTmpDir`, `statePath`, `createDefaultState`,
`readState`, `writeState` and `migrateState` — **do not re-import any of those**, a
duplicate binding is a syntax error. Add only this one import at the top of the file:

```js
import { readRawState, migrateStateFile } from '../../scripts/lib/state.mjs';
```

Then append the tests:

```js
function v1State() {
  return {
    schema_version: 1,
    plugin_version: '0.1.0',
    hackathon: null,
    project: null,
    phases: Object.fromEntries(
      ['recon', 'brainstorm', 'describe', 'stack', 'architect', 'requirements',
       'spec', 'build', 'ship', 'review', 'submit'].map((p) => [p, { status: 'not_started' }]),
    ),
    mode: 'solo',
    team: [],
    compliance: { last_checked: null, required_tech_verified: {} },
    budget: { total_hours: null, spent_hours: 0, phase_budget: {} },
  };
}

test('migrateState upgrades a v1 state by adding deliverables', () => {
  const { state, migrated, from } = migrateState(v1State());
  assert.equal(migrated, true);
  assert.equal(from, 1);
  assert.equal(state.schema_version, 2);
  assert.deepEqual(state.deliverables, { submission_requirements: [], bonus_content: [] });
});

test('migrateState preserves everything else in a v1 state', () => {
  const before = v1State();
  before.budget.total_hours = 48;
  before.phases.recon = { status: 'approved', artifacts: ['.hackathon/brief.md'] };
  const { state } = migrateState(before);
  assert.equal(state.budget.total_hours, 48);
  assert.deepEqual(state.phases.recon, { status: 'approved', artifacts: ['.hackathon/brief.md'] });
});

test('migrateState is idempotent on an already-migrated state', () => {
  const once = migrateState(v1State()).state;
  const { state, migrated } = migrateState(once);
  assert.equal(migrated, false);
  assert.deepEqual(state, once);
});

test('readRawState parses a v1 file that readState would reject', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), JSON.stringify(v1State()), 'utf8');
    await assert.rejects(() => readState(dir), /schema_version/);
    const raw = await readRawState(dir);
    assert.equal(raw.schema_version, 1);
  });
});

test('readRawState returns null when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.equal(await readRawState(dir), null);
  });
});

test('migrateStateFile upgrades a v1 file on disk and reports it', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/state.json'), JSON.stringify(v1State()), 'utf8');

    const result = await migrateStateFile(dir);
    assert.equal(result.migrated, true);
    assert.equal(result.from, 1);

    const after = await readState(dir);        // now passes validation
    assert.equal(after.schema_version, 2);
    assert.deepEqual(after.deliverables, { submission_requirements: [], bonus_content: [] });
  });
});

test('migrateStateFile is a no-op on a current-version file', async () => {
  await withTmpDir(async (dir) => {
    await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
    const before = await readFile(path.join(dir, '.hackathon/state.json'), 'utf8');
    const result = await migrateStateFile(dir);
    assert.equal(result.migrated, false);
    assert.equal(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'), before);
  });
});

test('migrateStateFile reports nothing to do when there is no state file', async () => {
  await withTmpDir(async (dir) => {
    assert.deepEqual(await migrateStateFile(dir), { migrated: false, from: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/iso-datetime.test.mjs tests/lib/schema.test.mjs tests/lib/state.test.mjs`
Expected: FAIL — `iso-datetime.mjs` does not exist; `CURRENT_SCHEMA_VERSION` is 1; `DELIVERABLE_STATUSES`, `readRawState`, `migrateStateFile` are not exported.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/iso-datetime.mjs`:

```js
// An ISO 8601 timestamp with an explicit UTC offset. The offset is the point: a
// hackathon deadline written without one means "whatever zone this machine is in",
// which is how a submission gets missed by a day.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function hasExplicitOffset(value) {
  if (typeof value !== 'string') return false;
  if (!ISO_WITH_OFFSET.test(value)) return false;
  // The regex accepts 2026-02-30; Date.parse does not. Both checks are needed:
  // Date.parse alone would happily accept a floating "2026-06-29T17:00:00".
  return !Number.isNaN(Date.parse(value));
}
```

Add to `scripts/lib/paths.mjs` (keep the existing exports):

```js
export const RECON_FILE = 'recon.json';
export const IDEAS_FILE = 'ideas.json';

export function reconPath(root) {
  return path.join(root, HACKATHON_DIR, RECON_FILE);
}

export function ideasPath(root) {
  return path.join(root, HACKATHON_DIR, IDEAS_FILE);
}
```

In `scripts/lib/schema.mjs`, change the version, add the deliverable statuses, extend
`createDefaultState`, and add two validation blocks to `validateState`:

```js
import { PHASES } from './paths.mjs';
import { hasExplicitOffset } from './iso-datetime.mjs';

export const CURRENT_SCHEMA_VERSION = 2;

export const PHASE_STATUSES = [
  'not_started', 'in_progress', 'awaiting_approval', 'approved', 'skipped',
];

export const DELIVERABLE_STATUSES = ['not_started', 'in_progress', 'done', 'skipped'];

const TIEBREAKS = ['listed_order', 'judge_vote', 'unspecified'];
```

In `createDefaultState`, add one key to the returned object, after `budget`:

```js
    deliverables: { submission_requirements: [], bonus_content: [] },
```

In `validateState`, insert these two blocks immediately before the final `mode` check:

```js
  // deliverables — seeded by :recon and :describe, delivered at :submit
  if (!state.deliverables || typeof state.deliverables !== 'object') {
    errors.push('deliverables missing');
  } else {
    for (const key of ['submission_requirements', 'bonus_content']) {
      if (!Array.isArray(state.deliverables[key])) {
        errors.push(`deliverables.${key} must be an array`);
      }
    }
    for (const item of state.deliverables.submission_requirements ?? []) {
      if (typeof item?.id !== 'string' || item.id === '') {
        errors.push('deliverables.submission_requirements[].id must be a non-empty string');
      }
      if (!DELIVERABLE_STATUSES.includes(item?.status)) {
        errors.push(
          `deliverables.submission_requirements[${item?.id}] has invalid status "${item?.status}"`,
        );
      }
    }
    for (const item of state.deliverables.bonus_content ?? []) {
      if (typeof item?.id !== 'string' || item.id === '') {
        errors.push('deliverables.bonus_content[].id must be a non-empty string');
      }
      if (!DELIVERABLE_STATUSES.includes(item?.status)) {
        errors.push(`deliverables.bonus_content[${item?.id}] has invalid status "${item?.status}"`);
      }
    }
  }

  // hackathon is null until :recon runs; once populated it is a digest, and the
  // deadline is the one field that must never be ambiguous.
  if (state.hackathon !== null && state.hackathon !== undefined) {
    const h = state.hackathon;
    if (typeof h.name !== 'string' || h.name === '') {
      errors.push('hackathon.name must be a non-empty string');
    }
    if (typeof h.url !== 'string' || h.url === '') {
      errors.push('hackathon.url must be a non-empty string');
    }
    if (!hasExplicitOffset(h.deadline)) {
      errors.push('hackathon.deadline must be ISO 8601 with an explicit UTC offset');
    }
    if (h.next_action_deadline != null && !hasExplicitOffset(h.next_action_deadline.at)) {
      errors.push('hackathon.next_action_deadline.at must be ISO 8601 with an explicit UTC offset');
    }
    if (!Array.isArray(h.criteria_ids)) {
      errors.push('hackathon.criteria_ids must be an array');
    }
    if (!TIEBREAKS.includes(h.tiebreak)) {
      errors.push(`hackathon.tiebreak must be one of ${TIEBREAKS.join(', ')}, got "${h.tiebreak}"`);
    }
  }
```

In `scripts/lib/state.mjs`, add the raw reader and the file-level migration, and replace
the `migrateState` stub:

```js
/**
 * Parse state.json WITHOUT validating it. readState() validates and therefore throws on
 * an older schema — which is exactly the state migration needs to read. Use this only
 * on the migration path.
 */
export async function readRawState(root) {
  let raw;
  try {
    raw = await readFile(statePath(root), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${statePath(root)} could not be parsed as JSON`);
  }
}

export function migrateState(state) {
  const from = state.schema_version;
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `state schema_version ${from} is newer than supported ${CURRENT_SCHEMA_VERSION}; upgrade the plugin`,
    );
  }
  let next = state;
  let migrated = false;

  // v1 -> v2: add the deliverables block. Additive only; nothing is reshaped or dropped,
  // which is what makes re-running this safe.
  if (next.schema_version === 1) {
    next = {
      ...next,
      schema_version: 2,
      deliverables: next.deliverables ?? { submission_requirements: [], bonus_content: [] },
    };
    migrated = true;
  }

  return { state: next, migrated, from };
}

/** Migrate the on-disk state file in place. Safe to call when there is no state file. */
export async function migrateStateFile(root) {
  const raw = await readRawState(root);
  if (raw === null) return { migrated: false, from: null };
  const { state, migrated, from } = migrateState(raw);
  if (migrated) await writeState(root, state);
  return { migrated, from };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — the full suite, including every M1 test. `createDefaultState` now emits
`deliverables`, so any M1 test asserting an exact default-state shape must be updated to
include it; if one fails, add the key to its expectation rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/iso-datetime.mjs scripts/lib/paths.mjs scripts/lib/schema.mjs \
        scripts/lib/state.mjs tests/lib/iso-datetime.test.mjs tests/lib/schema.test.mjs \
        tests/lib/state.test.mjs
git commit -m "feat: state schema v2 with deliverables, offset-checked deadlines, and v1 migration"
```

---

### Task 2: The recon extraction contract

**Files:**
- Create: `scripts/lib/recon-schema.mjs`
- Create: `tests/fixtures/h0-recon.json`
- Test: `tests/lib/recon-schema.test.mjs`

**Interfaces:**
- Consumes: `hasExplicitOffset(value)` from `iso-datetime.mjs` (Task 1).
- Produces:
  - `validateRecon(recon): { valid: boolean, errors: string[], warnings: string[] }`
  - `RECON_SCHEMA_VERSION = 1`, `DATE_KINDS = ['hard','action','informational']`,
    `TIEBREAKS = ['listed_order','judge_vote','unspecified']`,
    `WEIGHTINGS = ['equal','weighted']`
  - `tests/fixtures/h0-recon.json` — a golden fixture extracted from the real H0 hackathon in
    `examples/zero-hackathon/`, reused by Tasks 3, 4, 7 and 8.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/recon-schema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRecon, DATE_KINDS, TIEBREAKS, WEIGHTINGS }
  from '../../scripts/lib/recon-schema.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('the golden H0 fixture validates', async () => {
  const { valid, errors } = validateRecon(await golden());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('the vocabularies are exactly as specified', () => {
  assert.deepEqual(DATE_KINDS, ['hard', 'action', 'informational']);
  assert.deepEqual(TIEBREAKS, ['listed_order', 'judge_vote', 'unspecified']);
  assert.deepEqual(WEIGHTINGS, ['equal', 'weighted']);
});

test('rejects a non-object', () => {
  assert.equal(validateRecon(null).valid, false);
  assert.equal(validateRecon('nope').valid, false);
});

test('rejects a wrong schema_version', async () => {
  const r = await golden();
  r.schema_version = 2;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /schema_version/.test(e)));
});

test('rejects non-contiguous criterion ranks', async () => {
  const r = await golden();
  r.criteria.items[3].rank = 9;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /contiguous/.test(e)));
});

test('rejects duplicate criterion ids', async () => {
  const r = await golden();
  r.criteria.items[1].id = r.criteria.items[0].id;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /duplicate/.test(e)));
});

test('rejects a criterion with no quote', async () => {
  const r = await golden();
  r.criteria.items[0].quote = '';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /quote/.test(e)));
});

test('rejects weighted criteria whose weights do not sum to 1', async () => {
  const r = await golden();
  r.criteria.weighting = 'weighted';
  r.criteria.items[0].weight = 0.9;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /sum/.test(e)));
});

test('does not police weights when the weighting is equal', async () => {
  const r = await golden();
  r.criteria.weighting = 'equal';
  for (const item of r.criteria.items) item.weight = 999;
  assert.equal(validateRecon(r).valid, true, 'equal weighting derives weights, never trusts them');
});

test('rejects a date without an explicit offset', async () => {
  const r = await golden();
  r.dates[0].at = '2026-06-29T17:00:00';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /offset/.test(e)));
});

test('rejects an unknown date kind', async () => {
  const r = await golden();
  r.dates[1].kind = 'soonish';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /soonish/.test(e)));
});

test('requires exactly one hard date', async () => {
  const r = await golden();
  r.dates.push({ ...r.dates[0], label: 'a second deadline' });
  let res = validateRecon(r);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /exactly one/.test(e)));

  const r2 = await golden();
  for (const d of r2.dates) d.kind = 'informational';
  res = validateRecon(r2);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /exactly one/.test(e)));
});

test('rejects a hard submission requirement with no quote', async () => {
  const r = await golden();
  const hard = r.submission_requirements.find((s) => s.hard);
  hard.quote = '';
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => new RegExp(hard.id).test(e)));
});

test('allows a soft submission requirement with no quote', async () => {
  const r = await golden();
  r.submission_requirements.push({ id: 'nice-to-have', hard: false, requirement: 'a screenshot' });
  assert.equal(validateRecon(r).valid, true);
});

test('rejects observed gallery entries when the gallery is not available', async () => {
  const r = await golden();
  assert.equal(r.landscape.gallery_available, false, 'fixture is a live, pre-announcement hackathon');
  r.landscape.entries_observed = 412;
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /entries_observed/.test(e)));
});

test('allows observed gallery entries once the gallery is available', async () => {
  const r = await golden();
  r.landscape.gallery_available = true;
  r.landscape.entries_observed = 412;
  assert.equal(validateRecon(r).valid, true);
});

test('a non-empty unresolved list is still valid', async () => {
  const r = await golden();
  r.unresolved = ['Could not determine whether teams may share one AWS account.'];
  const { valid } = validateRecon(r);
  assert.equal(valid, true, 'recon may complete without knowing everything — it may not guess');
});

test('unknown top-level keys warn but do not fail', async () => {
  const r = await golden();
  r.sponsor_swag = ['stickers'];
  const { valid, warnings } = validateRecon(r);
  assert.equal(valid, true, 'a richer extraction must not be punished');
  assert.ok(warnings.some((w) => /sponsor_swag/.test(w)));
});

test('rejects an empty criteria list', async () => {
  const r = await golden();
  r.criteria.items = [];
  const { valid, errors } = validateRecon(r);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /at least one/.test(e)));
});

test('reports every error at once rather than stopping at the first', async () => {
  const r = await golden();
  r.criteria.items[0].quote = '';
  r.dates[0].at = 'June 29';
  const { errors } = validateRecon(r);
  assert.ok(errors.length >= 2, 'an agent retrying needs the whole list, not one error at a time');
});
```

Create `tests/fixtures/h0-recon.json` — extracted from `examples/zero-hackathon/overview.md`,
`rules.md` and `resources.md`:

```json
{
  "schema_version": 1,
  "source": {
    "url": "https://h01.devpost.com",
    "pages_fetched": [
      { "path": "/", "method": "webfetch", "fetched_at": "2026-06-05T09:00:00Z" },
      { "path": "/rules", "method": "webfetch", "fetched_at": "2026-06-05T09:00:12Z" },
      { "path": "/resources", "method": "webfetch", "fetched_at": "2026-06-05T09:00:25Z" },
      { "path": "/project-gallery", "method": "webfetch", "fetched_at": "2026-06-05T09:00:31Z" }
    ],
    "pages_failed": []
  },
  "identity": {
    "name": "H0: Hack the Zero Stack with Vercel v0 and AWS Databases",
    "host": "Amazon Web Services",
    "administrator": "Devpost",
    "theme_tags": ["Databases", "Open Ended", "Web"]
  },
  "dates": [
    {
      "label": "submission deadline",
      "at": "2026-06-29T17:00:00-07:00",
      "kind": "hard",
      "quote": "Submission Period: May 27, 2026 (11:00 am Pacific Time) – June 29, 2026 (5:00 pm Pacific Time)"
    },
    {
      "label": "credit request form closes",
      "at": "2026-06-26T12:00:00-07:00",
      "kind": "action",
      "quote": "In order to request AWS Promotional Credits, you must complete the form at: https://forms.gle/ozhbhvaXAxHxu3kMA by June 26th at 12pm PT."
    },
    {
      "label": "v0 credits expire",
      "at": "2026-07-13T23:59:00-07:00",
      "kind": "informational",
      "quote": "v0 Credits are not redeemable for cash and must be redeemed by July 13, 2026."
    },
    {
      "label": "judging period ends",
      "at": "2026-07-24T17:00:00-07:00",
      "kind": "informational",
      "quote": "Judging Period: June 30, 2026 (10:00 am Pacific Time) – July 24, 2026 (5:00 pm Pacific Time)"
    }
  ],
  "stage_one": {
    "exists": true,
    "quote": "The first stage will determine via pass/fail whether the ideas meet a baseline level of viability, in that the Project reasonably fits the theme and reasonably applies the required APIs/SDKs featured in the Hackathon.",
    "gates": [
      { "id": "theme-fit", "requirement": "Project reasonably fits the theme" },
      { "id": "required-api", "requirement": "Project reasonably applies the required APIs/SDKs" }
    ]
  },
  "criteria": {
    "weighting": "equal",
    "tiebreak": "listed_order",
    "max_base_score": 5,
    "items": [
      {
        "rank": 1,
        "id": "technical-implementation",
        "name": "Technical Implementation",
        "weight": 0.25,
        "quote": "Does the project demonstrate genuine software craftsmanship? Is the chosen AWS Database (Aurora, Aurora DSQL, or DynamoDB) integrated thoughtfully — with a data model, schema, or query design that reflects a deliberate architectural choice?",
        "signals": [
          "a deliberate data model, not a default",
          "Vercel deployment beyond a basic setup",
          "clean, maintainable, purposeful architecture"
        ],
        "evidence_slots": []
      },
      {
        "rank": 2,
        "id": "design",
        "name": "Design",
        "weight": 0.25,
        "quote": "Is the user experience intuitive and well-considered? Does the front-end feel designed in relation to the back-end? Is there a cohesive, intentional balance between the two layers that reflects full-stack thinking?",
        "signals": ["front-end designed in relation to the back-end", "full-stack coherence"],
        "evidence_slots": []
      },
      {
        "rank": 3,
        "id": "impact",
        "name": "Impact & Real-World Applicability",
        "weight": 0.25,
        "quote": "Does the project solve a meaningful problem for a real audience? Does the use of scalable database infrastructure and frontend deployment make the solution more viable — not just functional, but potentially shippable?",
        "signals": ["a real, nameable audience", "shippable, not just functional"],
        "evidence_slots": []
      },
      {
        "rank": 4,
        "id": "originality",
        "name": "Originality",
        "weight": 0.25,
        "quote": "How creative and original is the concept? Does the project demonstrate a genuine insight about what's possible with this stack? If the idea isn't new, how significantly does this implementation push it forward?",
        "signals": ["a genuine insight about the stack"],
        "evidence_slots": []
      }
    ]
  },
  "bonus": {
    "available": true,
    "max_points": 0.6,
    "per_item_points": 0.2,
    "max_score_with_bonus": 5.6,
    "kinds": ["blog", "podcast", "video"],
    "platforms": ["builder.aws.com", "medium.com", "dev.to", "YouTube", "LinkedIn"],
    "must_be_public": true,
    "required_disclosure": "You must include language that says you created the piece of content for the purposes of entering this hackathon.",
    "hashtag": "#H0Hackathon",
    "quote": "Submissions that advance to Stage Two may earn up to 0.6 additional points on top of their score by publishing a piece of content (blog, podcast, video) covering how the project was built using one of the required databases and Vercel on any public platform."
  },
  "tech": {
    "required": [
      {
        "name": "AWS Database",
        "one_of": ["Aurora PostgreSQL", "Aurora DSQL", "DynamoDB"],
        "quote": "all projects must use one of three designated Amazon Web Services Databases (Aurora, Aurora DSQL, or DynamoDB) as the primary back end"
      },
      {
        "name": "Vercel or v0.app deployment",
        "quote": "and deploy their front end on Vercel or v0.app"
      }
    ],
    "bonus": [],
    "forbidden": [],
    "encouraged": [
      {
        "name": "v0",
        "note": "recommended for speed, not required",
        "quote": "You must deploy on Vercel, but v0 is one of several ways to do that. v0 is recommended for speed, not required."
      }
    ]
  },
  "tracks": [
    {
      "id": "b2c",
      "name": "Monetizable B2C app",
      "description": "A business-to-consumer application for industries like ecommerce, travel, retail, or hospitality.",
      "prizes": [
        { "place": "First", "cash_usd": 10000, "other": "$10,000 AWS Credits" },
        { "place": "Second", "cash_usd": 5000, "other": "$5,000 AWS Credits" },
        { "place": "Third", "cash_usd": 3000, "other": "$3,000 AWS Credits" }
      ]
    },
    {
      "id": "b2b",
      "name": "Monetizable B2B app",
      "description": "A business-to-business application solving challenges in finance, technology, healthcare, insurance, marketing, or any other sector.",
      "prizes": [
        { "place": "First", "cash_usd": 10000, "other": "$10,000 AWS Credits" },
        { "place": "Second", "cash_usd": 5000, "other": "$5,000 AWS Credits" },
        { "place": "Third", "cash_usd": 3000, "other": "$3,000 AWS Credits" }
      ]
    },
    {
      "id": "million-scale",
      "name": "Million-scale global app",
      "description": "Gaming, social media, or entertainment, architected to scale to millions of users globally.",
      "prizes": [
        { "place": "First", "cash_usd": 10000, "other": "$10,000 AWS Credits" },
        { "place": "Second", "cash_usd": 5000, "other": "$5,000 AWS Credits" },
        { "place": "Third", "cash_usd": 3000, "other": "$3,000 AWS Credits" }
      ]
    },
    {
      "id": "open-innovation",
      "name": "Open innovation",
      "description": "Any full-stack application that creatively implements the Vercel/v0 and AWS Databases stack.",
      "prizes": [
        { "place": "First", "cash_usd": 10000, "other": "$10,000 AWS Credits" },
        { "place": "Second", "cash_usd": 5000, "other": "$5,000 AWS Credits" },
        { "place": "Third", "cash_usd": 3000, "other": "$3,000 AWS Credits" }
      ]
    }
  ],
  "open_prizes": [
    { "id": "best-technical-implementation", "name": "Best Technical Implementation", "cash_usd": 2000, "eligible": "all submissions" },
    { "id": "best-design", "name": "Best Design", "cash_usd": 2000, "eligible": "all submissions" },
    { "id": "most-impactful", "name": "Most Impactful", "cash_usd": 2000, "eligible": "all submissions" },
    { "id": "most-original", "name": "Most Original", "cash_usd": 2000, "eligible": "all submissions" }
  ],
  "prize_rules": {
    "one_prize_per_project": true,
    "quote": "Each Project is eligible to win one (1) prize."
  },
  "landscape": {
    "gallery_available": false,
    "gallery_note": "Devpost project galleries stay empty until winners are announced; per-track crowding is not observable during a live hackathon.",
    "total_participants": 8711,
    "participants_caveat": "registrations, not submissions — a weak proxy for field size",
    "entries_observed": null,
    "per_track": [],
    "observed_at": "2026-06-05T09:00:31Z",
    "prior_editions": []
  },
  "judges": [
    { "name": "Joseph Idziorek", "title": "Director, Product Management, AWS Databases", "org": "AWS" },
    { "name": "Tim Stoakes", "title": "Sr. Principal Technologist", "org": "AWS" },
    { "name": "Karthik Vijayraghavan", "title": "Sr Manager, NoSQL Solutions Architects", "org": "AWS" },
    { "name": "Aditya Samant", "title": "Principal Database Specialist Solutions Architect, AWS Databases", "org": "AWS" },
    { "name": "David Castro", "title": "Principal Product Manager, AWS Databases", "org": "AWS" },
    { "name": "Tony Gibbs", "title": "Senior Manager, Specialist Solutions Architects", "org": "AWS" },
    { "name": "Rohan Bhatia", "title": "Principal Product Manager, AWS Databases", "org": "AWS" },
    { "name": "Ravi Yadav", "title": "Principal Specialist, Data & AI", "org": "AWS" },
    { "name": "Gowri Balasubramanian", "title": "Sr. Manager, Solutions Architecture", "org": "AWS" },
    { "name": "Abhinav Anand", "title": "Technical Product Marketing", "org": "AWS" }
  ],
  "panel_read": "All ten judges are AWS database leadership — product managers, principal technologists and database specialist solutions architects. The database-architecture story is the strongest card: a deliberate data model, a defensible reason this engine and not another, and evidence the schema was designed rather than generated. Surface it early and everywhere.",
  "submission_requirements": [
    {
      "id": "text-description",
      "hard": true,
      "requirement": "A text description of the features and functionality that explicitly names the AWS Database used.",
      "quote": "Include a text description that should explain the features and functionality of your Project. Include which database(s) you used in your Project"
    },
    {
      "id": "demo-video",
      "hard": true,
      "requirement": "Under three minutes, public on YouTube, explains the AWS Database used, and shows the project functioning.",
      "quote": "should be less than three (3) minutes … should explain the AWS Database(s) used in the submission … must be uploaded to and made publicly visible on YouTube"
    },
    {
      "id": "architecture-diagram",
      "hard": true,
      "requirement": "A diagram showing how the application connects to back-end components.",
      "quote": "Include an Architecture Diagram that shows how the project application connects to back-end components"
    },
    {
      "id": "vercel-project-link",
      "hard": true,
      "requirement": "A link to the published Vercel project.",
      "quote": "Include a link to your published Vercel Project"
    },
    {
      "id": "vercel-team-id",
      "hard": true,
      "requirement": "The Vercel Team ID.",
      "quote": "Include your Vercel Team ID"
    },
    {
      "id": "db-proof-screenshot",
      "hard": true,
      "requirement": "A Storage Configuration screenshot proving AWS Database usage.",
      "quote": "Include the following screenshots of your v0/Vercel Project: Storage Configuration to prove AWS Database usage"
    }
  ],
  "submission_form": {
    "fields": [
      { "id": "project_name", "limit": 60, "unit": "characters" },
      { "id": "elevator_pitch", "limit": 200, "unit": "characters" },
      {
        "id": "about",
        "limit": null,
        "format": "markdown",
        "default_headings": [
          "Inspiration",
          "What it does",
          "How we built it",
          "Challenges we ran into",
          "Accomplishments that we're proud of",
          "What we learned",
          "What's next"
        ]
      }
    ],
    "gallery": { "max_images": 15, "ratio": "3:2", "max_mb": 5 }
  },
  "eligibility": {
    "excluded_regions": [
      "Argentina", "Italy", "Philippines", "Thailand", "Vietnam", "Syria", "Brazil",
      "Quebec", "Russia", "Crimea", "Cuba", "Iran", "North Korea"
    ],
    "notes": [
      "Any Judge, or company or individual that employs a Judge, is ineligible",
      "Employees and immediate family of the Sponsor and Administrator are ineligible"
    ],
    "quote": "Individuals who are residents of, or Organizations domiciled in, a country, state, province or territory where the laws of the United States or local law prohibits participating or receiving a prize in the Hackathon"
  },
  "constraints": [
    {
      "id": "judge-testing",
      "constraint": "Judges may score on the description, images and video alone. The project must be free and unrestricted to test, with credentials supplied if it is private.",
      "implication": "The written submission must stand on its own, and a no-account demo path is a rule rather than a nicety.",
      "quote": "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video provided in the Submission."
    },
    {
      "id": "new-and-existing",
      "constraint": "A pre-existing project must have adopted the required integration after the submission period opened, and evidence of in-window work may be demanded.",
      "implication": "Keep commit history inside the submission window.",
      "quote": "The administrator and/or the Sponsor reserve the right to request evidence of work completed during the Submission Period; failure to provide may result in disqualification."
    },
    {
      "id": "one-track-per-project",
      "constraint": "Each project may be submitted to exactly one track.",
      "implication": "Track choice is a single irreversible bet, so it is made deliberately at :describe.",
      "quote": "Each project can only be submitted to one Track."
    },
    {
      "id": "english",
      "constraint": "All submission materials must be in English, or accompanied by an English translation.",
      "implication": "No action needed; noted for completeness.",
      "quote": "All Submission materials must be in English or, if not in English, the Entrant must provide an English translation"
    }
  ],
  "host_guidance": [
    {
      "topic": "architecture diagram",
      "source": "/resources FAQ",
      "guidance": "Label every box with both what it is (the component type) and what it does. Show direction of calls with arrows, bidirectional only when it actually is. Group cloud-provider services in a dashed box. The AWS Architecture Icons set and draw.io are recommended."
    },
    {
      "topic": "AI-generated code",
      "source": "/resources FAQ",
      "guidance": "Using v0, Copilot or Cursor is allowed and encouraged, but submissions with no meaningful engineering decisions will score poorly on Technical Implementation."
    },
    {
      "topic": "multiple databases",
      "source": "/resources FAQ",
      "guidance": "A project may use more than one AWS Database; judges evaluate the architecture including the choice of database."
    },
    {
      "topic": "credential handling",
      "source": "/resources FAQ",
      "guidance": "Never commit credentials to the repository, which must be public for review. The Vercel Marketplace OIDC integration is the most secure option — IAM roles with no stored keys."
    }
  ],
  "ambiguities": [
    {
      "where": "Prizes table, Monetizable B2B second and third place",
      "issue": "The eligible-submissions column for both rows reads 'All eligible submissions that enter the Monetizable B2C App Track', which contradicts the row heading.",
      "likely_reading": "A copy-paste error; B2B prizes are awarded to B2B entries.",
      "remedy": "The rules invite a written request for clarification before the deadline: 'If at any time prior to the deadline, an Entrant or prospective Entrant believes that any term in the Official Rules is or may be ambiguous, they must submit a written request for clarification.'"
    }
  ],
  "unresolved": []
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/recon-schema.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/recon-schema.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/recon-schema.mjs`:

```js
import { hasExplicitOffset } from './iso-datetime.mjs';

export const RECON_SCHEMA_VERSION = 1;
export const DATE_KINDS = ['hard', 'action', 'informational'];
export const TIEBREAKS = ['listed_order', 'judge_vote', 'unspecified'];
export const WEIGHTINGS = ['equal', 'weighted'];

const WEIGHT_TOLERANCE = 0.001;

const KNOWN_TOP_LEVEL = new Set([
  'schema_version', 'source', 'identity', 'dates', 'stage_one', 'criteria', 'bonus',
  'tech', 'tracks', 'open_prizes', 'prize_rules', 'landscape', 'judges', 'panel_read',
  'submission_requirements', 'submission_form', 'eligibility', 'constraints',
  'host_guidance', 'ambiguities', 'unresolved',
]);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Validate a recon extraction. Returns every problem at once — an agent retrying an
 * extraction needs the whole list, not one error per round trip.
 */
export function validateRecon(recon) {
  const errors = [];
  const warnings = [];

  if (recon === null || typeof recon !== 'object' || Array.isArray(recon)) {
    return { valid: false, errors: ['recon must be an object'], warnings };
  }

  if (recon.schema_version !== RECON_SCHEMA_VERSION) {
    errors.push(
      `schema_version ${recon.schema_version} != supported ${RECON_SCHEMA_VERSION}`,
    );
  }

  for (const key of Object.keys(recon)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warnings.push(`unknown top-level key "${key}" (kept, not validated)`);
    }
  }

  if (!isNonEmptyString(recon.identity?.name)) {
    errors.push('identity.name must be a non-empty string');
  }

  validateDates(recon.dates, errors);
  validateCriteria(recon.criteria, errors);
  validateSubmissionRequirements(recon.submission_requirements, errors);
  validateLandscape(recon.landscape, errors);

  if (!Array.isArray(recon.tech?.required)) {
    errors.push('tech.required must be an array (empty is allowed; missing is not)');
  }
  if (recon.unresolved !== undefined && !Array.isArray(recon.unresolved)) {
    errors.push('unresolved must be an array');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateDates(dates, errors) {
  if (!Array.isArray(dates) || dates.length === 0) {
    errors.push('dates must be a non-empty array');
    return;
  }
  let hard = 0;
  for (const [i, d] of dates.entries()) {
    const where = `dates[${i}]${d?.label ? ` (${d.label})` : ''}`;
    if (!isNonEmptyString(d?.label)) errors.push(`${where}.label must be a non-empty string`);
    if (!hasExplicitOffset(d?.at)) {
      errors.push(`${where}.at must be ISO 8601 with an explicit UTC offset, got "${d?.at}"`);
    }
    if (!DATE_KINDS.includes(d?.kind)) {
      errors.push(`${where}.kind must be one of ${DATE_KINDS.join(', ')}, got "${d?.kind}"`);
    }
    if (d?.kind === 'hard') hard += 1;
  }
  if (hard !== 1) {
    errors.push(`dates must contain exactly one "hard" date (the submission deadline), found ${hard}`);
  }
}

function validateCriteria(criteria, errors) {
  if (!criteria || typeof criteria !== 'object') {
    errors.push('criteria missing');
    return;
  }
  if (!WEIGHTINGS.includes(criteria.weighting)) {
    errors.push(`criteria.weighting must be one of ${WEIGHTINGS.join(', ')}, got "${criteria.weighting}"`);
  }
  if (!TIEBREAKS.includes(criteria.tiebreak)) {
    errors.push(`criteria.tiebreak must be one of ${TIEBREAKS.join(', ')}, got "${criteria.tiebreak}"`);
  }

  const items = criteria.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('criteria.items must contain at least one criterion');
    return;
  }

  const seen = new Set();
  for (const [i, item] of items.entries()) {
    const where = `criteria.items[${i}]${item?.id ? ` (${item.id})` : ''}`;
    if (!isNonEmptyString(item?.id)) errors.push(`${where}.id must be a non-empty string`);
    if (!isNonEmptyString(item?.name)) errors.push(`${where}.name must be a non-empty string`);
    // A criterion without the host's own words cannot be scored against honestly.
    if (!isNonEmptyString(item?.quote)) errors.push(`${where}.quote must be a non-empty string`);
    if (isNonEmptyString(item?.id)) {
      if (seen.has(item.id)) errors.push(`${where} has a duplicate id "${item.id}"`);
      seen.add(item.id);
    }
    if (item?.evidence_slots !== undefined && !Array.isArray(item.evidence_slots)) {
      errors.push(`${where}.evidence_slots must be an array`);
    }
  }

  // rank is load-bearing: it is the tiebreak order, so rank 1 outweighs its nominal weight.
  const ranks = items.map((i) => i?.rank).sort((a, b) => a - b);
  const contiguous = ranks.every((r, i) => r === i + 1);
  if (!contiguous) {
    errors.push(`criteria.items ranks must be contiguous 1..${items.length}, got ${ranks.join(', ')}`);
  }

  // Weights are only trusted when the host actually weighted them. Under "equal"
  // weighting they are derived, so whatever the agent guessed is ignored.
  if (criteria.weighting === 'weighted') {
    const sum = items.reduce((acc, i) => acc + (typeof i?.weight === 'number' ? i.weight : NaN), 0);
    if (Number.isNaN(sum) || Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
      errors.push(`weighted criteria.items weights must sum to 1.0 ± ${WEIGHT_TOLERANCE}, got ${sum}`);
    }
  }
}

function validateSubmissionRequirements(reqs, errors) {
  if (!Array.isArray(reqs)) {
    errors.push('submission_requirements must be an array');
    return;
  }
  for (const [i, r] of reqs.entries()) {
    const where = `submission_requirements[${i}]${r?.id ? ` (${r.id})` : ''}`;
    if (!isNonEmptyString(r?.id)) errors.push(`${where}.id must be a non-empty string`);
    if (!isNonEmptyString(r?.requirement)) errors.push(`${where}.requirement must be a non-empty string`);
    // Hard requirements are the disqualifiers. Each one must be citable.
    if (r?.hard === true && !isNonEmptyString(r?.quote)) {
      errors.push(`${where} is hard:true and must carry a verbatim quote`);
    }
  }
}

function validateLandscape(landscape, errors) {
  if (landscape === undefined) return;
  if (!landscape || typeof landscape !== 'object') {
    errors.push('landscape must be an object when present');
    return;
  }
  // Devpost galleries stay empty until winners are announced. A crowding number during a
  // live hackathon is therefore invented, and inventing one is exactly what recon must not do.
  if (landscape.gallery_available !== true && landscape.entries_observed != null) {
    errors.push(
      'landscape.entries_observed must be null unless landscape.gallery_available is true — '
      + 'project galleries are empty until winners are announced',
    );
  }
  if (landscape.per_track !== undefined && !Array.isArray(landscape.per_track)) {
    errors.push('landscape.per_track must be an array');
  }
  if (landscape.prior_editions !== undefined && !Array.isArray(landscape.prior_editions)) {
    errors.push('landscape.prior_editions must be an array');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/recon-schema.test.mjs`
Expected: PASS, 20 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/recon-schema.mjs tests/lib/recon-schema.test.mjs tests/fixtures/h0-recon.json
git commit -m "feat: add recon extraction contract with a golden H0 fixture"
```

---

### Task 3: Rendering the recon artifacts

**Files:**
- Create: `scripts/lib/render-artifacts.mjs`
- Test: `tests/lib/render-artifacts.test.mjs`

**Interfaces:**
- Consumes: the golden fixture `tests/fixtures/h0-recon.json` (Task 2).
- Produces, all pure `(recon) => string`:
  - `renderBrief(recon)` — the digest a human reads first
  - `renderRules(recon)` — verbatim rules, eligibility, constraints, ambiguities
  - `renderCriteria(recon)` — the rubric, with the tiebreak-first criterion marked
  - `renderCriteriaMap(recon)` — the criteria-map table skeleton consumed by `:describe` in Task 7
  - `TIEBREAK_MARKER = '**(tiebreak first)**'` — one constant, so the marker the renderer
    writes and the marker the tests look for cannot drift apart

- [ ] **Step 1: Write the failing test**

Create `tests/lib/render-artifacts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderBrief, renderRules, renderCriteria, renderCriteriaMap, TIEBREAK_MARKER,
} from '../../scripts/lib/render-artifacts.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('the brief names the hackathon, the deadline and the panel read', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /H0: Hack the Zero Stack/);
  assert.match(out, /2026-06-29T17:00:00-07:00/);
  assert.match(out, /AWS database leadership/);
});

test('the brief lists action deadlines separately from the submission deadline', async () => {
  const out = renderBrief(await golden());
  // The credit form closed three days before submissions did. A single "deadline"
  // heading hides that, which is how free credits get missed.
  assert.match(out, /credit request form closes/);
  assert.match(out, /2026-06-26T12:00:00-07:00/);
});

test('the brief states the bonus ceiling, not just that a bonus exists', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /5\.6/);
  assert.match(out, /#H0Hackathon/);
});

test('the brief reports an empty gallery rather than implying no competition', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /gallery/i);
  assert.match(out, /until winners are announced/);
});

test('the brief surfaces unresolved items when there are any', async () => {
  const r = await golden();
  r.unresolved = ['Whether teams may share one AWS account is not stated anywhere.'];
  const out = renderBrief(r);
  assert.match(out, /Unresolved/);
  assert.match(out, /share one AWS account/);
});

test('the brief says so plainly when nothing is unresolved', async () => {
  const out = renderBrief(await golden());
  assert.doesNotMatch(out, /Unresolved/);
});

test('the criteria rubric marks the tiebreak-first criterion and only that one', async () => {
  const out = renderCriteria(await golden());
  const marks = out.split(TIEBREAK_MARKER).length - 1;
  assert.equal(marks, 1, 'exactly one criterion is the tiebreaker');
  const firstLine = out.split('\n').find((l) => l.includes('Technical Implementation'));
  assert.ok(firstLine.includes(TIEBREAK_MARKER), 'rank 1 carries the marker');
});

test('the criteria rubric renders criteria in rank order regardless of array order', async () => {
  const r = await golden();
  r.criteria.items.reverse();
  const out = renderCriteria(r);
  assert.ok(
    out.indexOf('Technical Implementation') < out.indexOf('Originality'),
    'rank, not array position, decides the order',
  );
});

test('the criteria rubric quotes the host verbatim for every criterion', async () => {
  const r = await golden();
  const out = renderCriteria(r);
  for (const item of r.criteria.items) {
    assert.ok(out.includes(item.quote), `missing verbatim quote for ${item.id}`);
  }
});

test('the criteria rubric explains what equal weighting plus a tiebreak actually means', async () => {
  const out = renderCriteria(await golden());
  assert.match(out, /equally weighted/i);
  assert.match(out, /tie/i);
});

test('the rules artifact carries eligibility exclusions, constraints and ambiguities', async () => {
  const out = renderRules(await golden());
  assert.match(out, /Philippines/);
  assert.match(out, /judge-testing|Judges may score/i);
  assert.match(out, /copy-paste error/);
  assert.match(out, /written request for clarification/);
});

test('the rules artifact lists every hard submission requirement', async () => {
  const r = await golden();
  const out = renderRules(r);
  for (const req of r.submission_requirements.filter((s) => s.hard)) {
    assert.ok(out.includes(req.id), `missing hard requirement ${req.id}`);
  }
});

test('the rules artifact reproduces host guidance verbatim', async () => {
  const r = await golden();
  const out = renderRules(r);
  assert.ok(out.includes(r.host_guidance[0].guidance));
});

test('the criteria map has one row per criterion, in rank order', async () => {
  const r = await golden();
  const out = renderCriteriaMap(r);
  const rows = out.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---'));
  // header + one row per criterion
  assert.equal(rows.length, r.criteria.items.length + 1);
  assert.ok(out.indexOf('Technical Implementation') < out.indexOf('Design'));
});

test('the criteria map leaves the how-we-win column empty for the author to fill', async () => {
  const out = renderCriteriaMap(await golden());
  assert.match(out, /How .* wins it/i);
  assert.match(out, /_/, 'empty cells are marked, not silently blank');
});

test('renderers never emit undefined', async () => {
  const r = await golden();
  for (const [name, fn] of Object.entries({ renderBrief, renderRules, renderCriteria, renderCriteriaMap })) {
    assert.doesNotMatch(fn(r), /undefined/, `${name} leaked an undefined`);
  }
});

test('renderers tolerate a sparse extraction', async () => {
  const r = await golden();
  delete r.bonus;
  delete r.host_guidance;
  delete r.ambiguities;
  delete r.landscape;
  delete r.judges;
  delete r.panel_read;
  for (const fn of [renderBrief, renderRules, renderCriteria, renderCriteriaMap]) {
    const out = fn(r);
    assert.equal(typeof out, 'string');
    assert.doesNotMatch(out, /undefined/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/render-artifacts.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/render-artifacts.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/render-artifacts.mjs`:

```js
export const TIEBREAK_MARKER = '**(tiebreak first)**';

const byRank = (items = []) => [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
const bullet = (s) => `- ${s}`;

/** Escape a cell so a quote containing a pipe cannot break the markdown table. */
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

export function renderBrief(recon) {
  const lines = [];
  const id = recon.identity ?? {};
  const dates = recon.dates ?? [];
  const hard = dates.find((d) => d.kind === 'hard');
  const actions = dates.filter((d) => d.kind === 'action');
  const info = dates.filter((d) => d.kind === 'informational');

  lines.push(`# ${id.name ?? 'Hackathon'} — brief`);
  lines.push('');
  if (id.host) lines.push(`**Host:** ${id.host}`);
  if (id.administrator) lines.push(`**Administrator:** ${id.administrator}`);
  if (recon.source?.url) lines.push(`**Source:** ${recon.source.url}`);
  lines.push('');

  lines.push('## Deadlines');
  lines.push('');
  if (hard) lines.push(`**Submission deadline — ${hard.at}.** ${hard.label}.`);
  if (actions.length > 0) {
    lines.push('');
    lines.push('Dated actions that close *before* the work is due — miss these and you lose the resource, not the hackathon:');
    lines.push('');
    for (const d of actions) lines.push(bullet(`**${d.at}** — ${d.label}`));
  }
  if (info.length > 0) {
    lines.push('');
    lines.push('For reference:');
    lines.push('');
    for (const d of info) lines.push(bullet(`${d.at} — ${d.label}`));
  }
  lines.push('');

  if (recon.stage_one?.exists) {
    lines.push('## Stage One — pass/fail before anything is scored');
    lines.push('');
    for (const g of recon.stage_one.gates ?? []) lines.push(bullet(`**${g.id}** — ${g.requirement}`));
    if (recon.stage_one.quote) {
      lines.push('');
      lines.push(`> ${recon.stage_one.quote}`);
    }
    lines.push('');
  }

  const required = recon.tech?.required ?? [];
  if (required.length > 0) {
    lines.push('## Required technology (non-negotiable)');
    lines.push('');
    for (const t of required) {
      const oneOf = Array.isArray(t.one_of) && t.one_of.length > 0
        ? ` — one of: ${t.one_of.join(', ')}`
        : '';
      lines.push(bullet(`**${t.name}**${oneOf}`));
    }
    lines.push('');
  }

  const tracks = recon.tracks ?? [];
  if (tracks.length > 0) {
    lines.push('## Tracks and prizes');
    lines.push('');
    for (const t of tracks) {
      const first = (t.prizes ?? []).find((p) => /first/i.test(p.place ?? ''));
      const amount = first?.cash_usd != null ? ` — first place $${first.cash_usd.toLocaleString('en-US')}` : '';
      lines.push(bullet(`**${t.name}** (\`${t.id}\`)${amount}`));
    }
    if ((recon.open_prizes ?? []).length > 0) {
      lines.push('');
      lines.push('Open to every submission regardless of track:');
      lines.push('');
      for (const p of recon.open_prizes) {
        const amount = p.cash_usd != null ? ` — $${p.cash_usd.toLocaleString('en-US')}` : '';
        lines.push(bullet(`**${p.name}**${amount}`));
      }
    }
    if (recon.prize_rules?.one_prize_per_project) {
      lines.push('');
      lines.push('> Each project is eligible to win **one** prize. Track choice is a single bet.');
    }
    lines.push('');
  }

  if (recon.bonus?.available) {
    const b = recon.bonus;
    lines.push('## Bonus points — the cheapest score on offer');
    lines.push('');
    lines.push(
      `Up to **+${b.max_points}** (${b.per_item_points} per published piece), raising the ceiling `
      + `from ${recon.criteria?.max_base_score ?? '?'} to **${b.max_score_with_bonus}**.`,
    );
    lines.push('');
    if ((b.kinds ?? []).length > 0) lines.push(bullet(`Accepted: ${b.kinds.join(', ')}`));
    if ((b.platforms ?? []).length > 0) lines.push(bullet(`Platforms: ${b.platforms.join(', ')}`));
    if (b.required_disclosure) lines.push(bullet(`Required disclosure: "${b.required_disclosure}"`));
    if (b.hashtag) lines.push(bullet(`Hashtag: ${b.hashtag}`));
    lines.push('');
  }

  const judges = recon.judges ?? [];
  if (judges.length > 0 || recon.panel_read) {
    lines.push('## The panel');
    lines.push('');
    if (recon.panel_read) {
      lines.push(recon.panel_read);
      lines.push('');
    }
    for (const j of judges) {
      lines.push(bullet(`${j.name}${j.title ? ` — ${j.title}` : ''}${j.org ? `, ${j.org}` : ''}`));
    }
    lines.push('');
  }

  const ls = recon.landscape;
  if (ls) {
    lines.push('## Field');
    lines.push('');
    if (ls.total_participants != null) {
      lines.push(bullet(
        `${ls.total_participants.toLocaleString('en-US')} registered`
        + (ls.participants_caveat ? ` — ${ls.participants_caveat}` : ''),
      ));
    }
    if (ls.gallery_available === true && ls.entries_observed != null) {
      lines.push(bullet(`${ls.entries_observed} entries visible in the project gallery`));
    } else {
      lines.push(bullet(
        'Project gallery is empty — Devpost galleries populate only **until winners are announced**, '
        + 'so per-track crowding cannot be observed during a live hackathon.',
      ));
    }
    for (const p of ls.prior_editions ?? []) {
      lines.push(bullet(`Prior edition **${p.name}** — ${p.entries_observed ?? 'unknown'} entries, ${(p.winners ?? []).length} winners recorded`));
    }
    lines.push('');
  }

  const unresolved = recon.unresolved ?? [];
  if (unresolved.length > 0) {
    lines.push('## Unresolved');
    lines.push('');
    lines.push('Recon could not determine the following. These are open questions, not assumptions:');
    lines.push('');
    for (const u of unresolved) lines.push(bullet(u));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderCriteria(recon) {
  const c = recon.criteria ?? {};
  const items = byRank(c.items);
  const lines = [];

  lines.push(`# Judging rubric — ${recon.identity?.name ?? 'Hackathon'}`);
  lines.push('');
  lines.push(
    c.weighting === 'equal'
      ? `The criteria are **equally weighted**, out of ${c.max_base_score ?? '?'}.`
      : `The criteria are **weighted**, out of ${c.max_base_score ?? '?'}.`,
  );
  if (c.tiebreak === 'listed_order') {
    lines.push('');
    lines.push(
      'Ties are broken by the **first listed criterion**, then the next, and so on. Equal '
      + 'weighting therefore does not mean equal value: the top-ranked criterion decides '
      + 'close calls and is worth more than its weight suggests.',
    );
  } else if (c.tiebreak === 'judge_vote') {
    lines.push('');
    lines.push('Ties are broken by a vote of the judging panel.');
  }
  lines.push('');

  for (const item of items) {
    const marker = item.rank === 1 && c.tiebreak === 'listed_order' ? ` ${TIEBREAK_MARKER}` : '';
    lines.push(`## ${item.rank}. ${item.name}${marker}`);
    lines.push('');
    lines.push(`\`${item.id}\`${item.weight != null ? ` · weight ${item.weight}` : ''}`);
    lines.push('');
    lines.push(`> ${item.quote}`);
    lines.push('');
    if ((item.signals ?? []).length > 0) {
      lines.push('What this rewards:');
      lines.push('');
      for (const s of item.signals) lines.push(bullet(s));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '`evidence_slots` on each criterion is filled later by `:check` and `:review` with '
    + '`file:line` citations. A claim without a citation is unverified.',
  );

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderCriteriaMap(recon) {
  const c = recon.criteria ?? {};
  const items = byRank(c.items);
  const name = recon.identity?.name ? 'this project' : 'this project';
  const lines = [];

  lines.push(`| # | Criterion | What the host asks | How ${name} wins it |`);
  lines.push('|---|---|---|---|');
  for (const item of items) {
    const marker = item.rank === 1 && c.tiebreak === 'listed_order' ? ` ${TIEBREAK_MARKER}` : '';
    lines.push(`| ${item.rank} | **${cell(item.name)}**${marker} | ${cell(item.quote)} | _to be written_ |`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderRules(recon) {
  const lines = [];
  lines.push(`# Rules that bind us — ${recon.identity?.name ?? 'Hackathon'}`);
  lines.push('');
  lines.push('Extracted verbatim. Where this file and the hackathon site disagree, the site wins.');
  lines.push('');

  const hard = (recon.submission_requirements ?? []).filter((r) => r.hard);
  const soft = (recon.submission_requirements ?? []).filter((r) => !r.hard);
  if (hard.length > 0) {
    lines.push('## Hard submission requirements');
    lines.push('');
    lines.push('Every one of these is a disqualifier if missing.');
    lines.push('');
    for (const r of hard) {
      lines.push(`### \`${r.id}\``);
      lines.push('');
      lines.push(r.requirement);
      lines.push('');
      if (r.quote) {
        lines.push(`> ${r.quote}`);
        lines.push('');
      }
    }
  }
  if (soft.length > 0) {
    lines.push('## Optional submission elements');
    lines.push('');
    for (const r of soft) lines.push(bullet(`\`${r.id}\` — ${r.requirement}`));
    lines.push('');
  }

  const constraints = recon.constraints ?? [];
  if (constraints.length > 0) {
    lines.push('## Constraints on how we build');
    lines.push('');
    for (const c of constraints) {
      lines.push(`### \`${c.id}\``);
      lines.push('');
      lines.push(c.constraint);
      lines.push('');
      if (c.implication) {
        lines.push(`**What this means for us:** ${c.implication}`);
        lines.push('');
      }
      if (c.quote) {
        lines.push(`> ${c.quote}`);
        lines.push('');
      }
    }
  }

  const el = recon.eligibility;
  if (el) {
    lines.push('## Eligibility');
    lines.push('');
    if ((el.excluded_regions ?? []).length > 0) {
      lines.push(`**Excluded regions:** ${el.excluded_regions.join(', ')}.`);
      lines.push('');
      lines.push('Check this against your own residence before spending a single hour.');
      lines.push('');
    }
    for (const n of el.notes ?? []) lines.push(bullet(n));
    if ((el.notes ?? []).length > 0) lines.push('');
    if (el.quote) {
      lines.push(`> ${el.quote}`);
      lines.push('');
    }
  }

  const guidance = recon.host_guidance ?? [];
  if (guidance.length > 0) {
    lines.push('## Host guidance');
    lines.push('');
    lines.push('The host telling us how they will read our work. Treat as scoring instructions.');
    lines.push('');
    for (const g of guidance) {
      lines.push(`### ${g.topic}${g.source ? ` — ${g.source}` : ''}`);
      lines.push('');
      lines.push(g.guidance);
      lines.push('');
    }
  }

  const amb = recon.ambiguities ?? [];
  if (amb.length > 0) {
    lines.push('## Ambiguities in the rules');
    lines.push('');
    for (const a of amb) {
      lines.push(`### ${a.where}`);
      lines.push('');
      lines.push(bullet(`**Issue:** ${a.issue}`));
      if (a.likely_reading) lines.push(bullet(`**Likely reading:** ${a.likely_reading}`));
      if (a.remedy) lines.push(bullet(`**Remedy:** ${a.remedy}`));
      lines.push('');
    }
  }

  const form = recon.submission_form;
  if (form) {
    lines.push('## Submission form');
    lines.push('');
    for (const f of form.fields ?? []) {
      const limit = f.limit != null ? ` — max ${f.limit} ${f.unit ?? 'characters'}` : '';
      lines.push(bullet(`\`${f.id}\`${limit}`));
      for (const h of f.default_headings ?? []) lines.push(`  - ${h}`);
    }
    if (form.gallery) {
      const g = form.gallery;
      lines.push(bullet(
        `Gallery — up to ${g.max_images ?? '?'} images, ${g.ratio ?? '?'}, ${g.max_mb ?? '?'} MB each`,
      ));
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/render-artifacts.test.mjs`
Expected: PASS, 17 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render-artifacts.mjs tests/lib/render-artifacts.test.mjs
git commit -m "feat: render brief, rules and judging rubric from a validated recon payload"
```

---

### Task 4: The `:recon` CLI — validate, then apply

**Files:**
- Create: `scripts/lib/recon-apply.mjs`
- Create: `scripts/recon.mjs`
- Test: `tests/lib/recon-apply.test.mjs`
- Test: `tests/cli.test.mjs` (extend)

**Interfaces:**
- Consumes: `validateRecon` (Task 2); `renderBrief`, `renderRules`, `renderCriteria` (Task 3); `readState`, `writeState`, `migrateStateFile` (Task 1); `reconPath`, `HACKATHON_DIR` (Task 1).
- Produces:
  - `buildHackathonDigest(recon, { now }): object` — the `state.hackathon` block
  - `nextActionDeadline(dates, now): {label, at}|null`
  - `buildSubmissionDeliverables(recon): Array<{id, status}>`
  - `applyRecon(root, recon, { now }): Promise<{ artifacts: string[] }>`
  - CLI: `node scripts/recon.mjs validate <path> [--json]` and `node scripts/recon.mjs apply <root> [--recon <path>]`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/recon-apply.test.mjs`:

```js
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
    assert.equal(state.schema_version, 2);
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
```

Append to `tests/cli.test.mjs`. The file already imports `test`, `assert`, `execFile`,
`promisify`, `fileURLToPath`, `readFile`, `access`, `path` and `withTmpDir`, and already
declares `const run` and `const scripts` — **do not re-declare any of those**, a duplicate
binding is a syntax error. Extend the existing `node:fs/promises` import to add `copyFile`,
`writeFile` and `mkdir`, then add one constant:

```js
const fixture = fileURLToPath(new URL('./fixtures/h0-recon.json', import.meta.url));
```

Then append the tests, reusing the existing `run` and `scripts` bindings:

```js
test('recon.mjs validate exits 0 on the golden fixture', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'validate', fixture]);
  assert.match(stdout, /valid/i);
});

test('recon.mjs validate exits non-zero and names every problem on a bad payload', async () => {
  await withTmpDir(async (dir) => {
    const bad = JSON.parse(await readFile(fixture, 'utf8'));
    bad.dates[0].at = 'June 29';
    bad.criteria.items[0].quote = '';
    const p = path.join(dir, 'bad.json');
    await writeFile(p, JSON.stringify(bad), 'utf8');

    await assert.rejects(
      () => run('node', [path.join(scripts, 'recon.mjs'), 'validate', p]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /offset/);
        assert.match(err.stderr, /quote/);
        return true;
      },
    );
  });
});

test('recon.mjs validate --json emits a machine-readable result', async () => {
  const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'validate', fixture, '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.errors, []);
});

test('recon.mjs apply writes the artifacts end to end', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.hackathon/recon.json'));
    await run('node', [path.join(scripts, 'init.mjs'), dir, '--apply']);
    const { stdout } = await run('node', [path.join(scripts, 'recon.mjs'), 'apply', dir]);
    assert.match(stdout, /brief\.md/);
    assert.match(stdout, /criteria\.md/);
    const state = JSON.parse(await readFile(path.join(dir, '.hackathon/state.json'), 'utf8'));
    assert.equal(state.schema_version, 2);
    assert.ok(state.hackathon.deadline.endsWith('-07:00'));
  });
});

test('recon.mjs apply refuses to run when there is no state', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await copyFile(fixture, path.join(dir, '.hackathon/recon.json'));
    await assert.rejects(
      () => run('node', [path.join(scripts, 'recon.mjs'), 'apply', dir]),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /init/i);
        return true;
      },
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/recon-apply.test.mjs tests/cli.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/recon-apply.mjs'`, and `recon.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/recon-apply.mjs`:

```js
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateRecon } from './recon-schema.mjs';
import { renderBrief, renderRules, renderCriteria } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, RECON_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;

/** The soonest `action` date still ahead of `now`, or null. */
export function nextActionDeadline(dates = [], now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Date.parse(now);
  const upcoming = dates
    .filter((d) => d.kind === 'action' && Date.parse(d.at) > ms)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const next = upcoming[0];
  return next ? { label: next.label, at: next.at } : null;
}

/** Flatten a required-tech entry into one printable string for the hook and status board. */
function techLabel(t) {
  if (typeof t === 'string') return t;
  const oneOf = Array.isArray(t.one_of) && t.one_of.length > 0 ? ` (${t.one_of.join(' | ')})` : '';
  return `${t.name}${oneOf}`;
}

export function buildHackathonDigest(recon, { now = new Date() } = {}) {
  const hard = (recon.dates ?? []).find((d) => d.kind === 'hard');
  const items = [...(recon.criteria?.items ?? [])].sort((a, b) => a.rank - b.rank);

  return {
    name: recon.identity?.name ?? '',
    url: recon.source?.url ?? '',
    deadline: hard?.at ?? '',
    next_action_deadline: nextActionDeadline(recon.dates, now),
    tech: {
      required: (recon.tech?.required ?? []).map(techLabel),
      bonus: (recon.tech?.bonus ?? []).map(techLabel),
      forbidden: (recon.tech?.forbidden ?? []).map(techLabel),
    },
    criteria_ids: items.map((i) => i.id),
    tiebreak: recon.criteria?.tiebreak ?? 'unspecified',
    bonus_points_available: recon.bonus?.available ? (recon.bonus.max_points ?? 0) : 0,
    selected_track: null,
    recon_ref: rel(RECON_FILE),
  };
}

export function buildSubmissionDeliverables(recon) {
  return (recon.submission_requirements ?? [])
    .filter((r) => r.hard === true)
    .map((r) => ({ id: r.id, status: 'not_started' }));
}

/**
 * Merge freshly-seeded deliverables with whatever is already tracked. Re-running :recon
 * must never reset progress the user already made.
 */
function mergeDeliverables(existing = [], seeded = []) {
  const byId = new Map(existing.map((d) => [d.id, d]));
  return seeded.map((s) => byId.get(s.id) ?? s);
}

export async function applyRecon(root, recon, { now = new Date() } = {}) {
  const { valid, errors } = validateRecon(recon);
  if (!valid) {
    throw new Error(`refusing to apply an invalid recon payload:\n  ${errors.join('\n  ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  const files = [
    [RECON_FILE, `${JSON.stringify(recon, null, 2)}\n`],
    ['brief.md', renderBrief(recon)],
    ['rules.md', renderRules(recon)],
    ['criteria.md', renderCriteria(recon)],
  ];
  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }
  const artifacts = files.map(([name]) => rel(name));

  const next = {
    ...state,
    hackathon: buildHackathonDigest(recon, { now }),
    deliverables: {
      ...state.deliverables,
      submission_requirements: mergeDeliverables(
        state.deliverables?.submission_requirements,
        buildSubmissionDeliverables(recon),
      ),
      bonus_content: state.deliverables?.bonus_content ?? [],
    },
    phases: {
      ...state.phases,
      // The approval gate is at the phase exit: recon has produced its artifacts and
      // now waits on a human. :next refuses to advance past awaiting_approval.
      recon: { ...state.phases.recon, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts };
}
```

Create `scripts/recon.mjs`:

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRecon } from './lib/recon-schema.mjs';
import { applyRecon } from './lib/recon-apply.mjs';
import { reconPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: recon.mjs validate <path-to-recon.json> [--json]');
  console.error('       recon.mjs apply <project-root> [--recon <path>]');
  process.exit(2);
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'validate') {
  if (!target) usage();
  const recon = await readJson(path.resolve(target));
  const result = validateRecon(recon);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('recon.json is valid.');
    process.exit(0);
  }
  // Errors go to stderr as a complete list — the agent retrying needs all of them at once.
  console.error(`recon.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--recon');
  const source = idx === -1 ? reconPath(root) : path.resolve(rest[idx + 1]);
  const recon = await readJson(source);

  try {
    const { artifacts } = await applyRecon(root, recon);
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    console.log('\nPhase "recon" is now awaiting_approval. Present the brief and rubric, then ask.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/recon-apply.test.mjs tests/cli.test.mjs`
Expected: PASS, 17 + 5 new tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/recon-apply.mjs scripts/recon.mjs tests/lib/recon-apply.test.mjs tests/cli.test.mjs
git commit -m "feat: add the :recon CLI — validate a payload, then apply it to state and artifacts"
```

---

### Task 5: The ideas scoring contract

**Files:**
- Create: `scripts/lib/ideas-schema.mjs`
- Create: `tests/fixtures/h0-ideas.json`
- Test: `tests/lib/ideas-schema.test.mjs`

**Interfaces:**
- Consumes: the golden recon fixture (Task 2) for cross-checking criterion ids.
- Produces:
  - `validateIdeas(doc, recon?): { valid, errors, warnings }`
  - `IDEAS_SCHEMA_VERSION = 1`
  - `tests/fixtures/h0-ideas.json` — a two-idea, one-disqualified fixture reused by Task 6.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ideas-schema.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateIdeas } from '../../scripts/lib/ideas-schema.mjs';

async function load(name) {
  const raw = await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  return JSON.parse(raw);
}
const ideas = () => load('h0-ideas.json');
const recon = () => load('h0-recon.json');

test('the golden ideas fixture validates against the golden rubric', async () => {
  const { valid, errors } = validateIdeas(await ideas(), await recon());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('validates standalone when no rubric is supplied', async () => {
  assert.equal(validateIdeas(await ideas()).valid, true);
});

test('rejects a non-object', () => {
  assert.equal(validateIdeas(null).valid, false);
});

test('rejects a wrong schema_version', async () => {
  const d = await ideas();
  d.schema_version = 7;
  assert.ok(validateIdeas(d).errors.some((e) => /schema_version/.test(e)));
});

test('rejects a non-positive round number', async () => {
  const d = await ideas();
  d.round = 0;
  assert.ok(validateIdeas(d).errors.some((e) => /round/.test(e)));
});

test('rejects a scored idea that failed the Stage-One gate', async () => {
  const d = await ideas();
  d.ideas[0].stage_one.pass = false;
  const { valid, errors } = validateIdeas(d);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /disqualified/.test(e)));
});

test('rejects a disqualified idea that carries scores', async () => {
  const d = await ideas();
  d.disqualified[0].scores = [{ criterion_id: 'design', score: 4, rationale: 'looks nice' }];
  const { valid, errors } = validateIdeas(d);
  assert.equal(valid, false);
  // Scoring a non-compliant idea is how you fall in love with one that cannot win.
  assert.ok(errors.some((e) => /must not carry scores/.test(e)));
});

test('requires a reason for every disqualification', async () => {
  const d = await ideas();
  d.disqualified[0].stage_one.reasons = [];
  assert.ok(validateIdeas(d).errors.some((e) => /reason/.test(e)));
});

test('requires a thesis on every scored idea', async () => {
  const d = await ideas();
  d.ideas[0].thesis = '';
  assert.ok(validateIdeas(d).errors.some((e) => /thesis/.test(e)));
});

test('requires an inversion on every scored idea', async () => {
  const d = await ideas();
  delete d.ideas[1].inversion;
  assert.ok(validateIdeas(d).errors.some((e) => /inversion/.test(e)));
});

test('requires a demo moment on every scored idea', async () => {
  const d = await ideas();
  d.ideas[0].demo_moment = '   ';
  assert.ok(validateIdeas(d).errors.some((e) => /demo_moment/.test(e)));
});

test('requires a track id on every scored idea', async () => {
  const d = await ideas();
  delete d.ideas[0].track;
  assert.ok(validateIdeas(d).errors.some((e) => /track/.test(e)));
});

test('rejects a criterion id that does not exist in the rubric', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].criterion_id = 'vibes';
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /vibes/.test(e)));
});

test('rejects a scored idea missing a criterion the rubric requires', async () => {
  const d = await ideas();
  d.ideas[0].scores.pop();
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /every criterion/.test(e)));
});

test('rejects a duplicate criterion score on one idea', async () => {
  const d = await ideas();
  d.ideas[0].scores[1].criterion_id = d.ideas[0].scores[0].criterion_id;
  assert.ok(validateIdeas(d, await recon()).errors.some((e) => /duplicate/.test(e)));
});

test('rejects a non-numeric score', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].score = 'high';
  assert.ok(validateIdeas(d).errors.some((e) => /score/.test(e)));
});

test('rejects a score above the rubric maximum', async () => {
  const d = await ideas();
  d.ideas[0].scores[0].score = 9;
  const { valid, errors } = validateIdeas(d, await recon());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /max_base_score|out of range/.test(e)));
});

test('rejects non-contiguous ranks', async () => {
  const d = await ideas();
  d.ideas[1].rank = 5;
  assert.ok(validateIdeas(d).errors.some((e) => /contiguous/.test(e)));
});

test('rejects duplicate idea ids across scored and disqualified', async () => {
  const d = await ideas();
  d.disqualified[0].id = d.ideas[0].id;
  assert.ok(validateIdeas(d).errors.some((e) => /duplicate/.test(e)));
});

test('accepts a round where every idea was disqualified', async () => {
  const d = await ideas();
  d.disqualified.push(...d.ideas.map((i) => ({
    id: i.id, name: i.name, pitch: i.pitch,
    stage_one: { pass: false, reasons: ['no required database'] },
  })));
  d.ideas = [];
  const { valid } = validateIdeas(d);
  assert.equal(valid, true, 'a round that produced nothing usable is a real, reportable outcome');
});

test('reports every error at once', async () => {
  const d = await ideas();
  d.ideas[0].thesis = '';
  d.ideas[1].demo_moment = '';
  assert.ok(validateIdeas(d).errors.length >= 2);
});
```

Create `tests/fixtures/h0-ideas.json`:

```json
{
  "schema_version": 1,
  "round": 1,
  "generated_at": "2026-06-05T11:00:00Z",
  "criteria_ref": ".hackathon/recon.json",
  "ideas": [
    {
      "id": "idea-07",
      "name": "CareCircle",
      "pitch": "One shared record for everyone caring for someone.",
      "angle": "social-impact",
      "stage_one": {
        "pass": true,
        "reasons": [
          "Aurora PostgreSQL is the primary back end, not an add-on",
          "fits the Monetizable B2C track"
        ]
      },
      "thesis": "Caregiving is relational, transactional and access-controlled, so authorization belongs in the database — a key-value store cannot enforce it.",
      "inversion": "Permissions live in the database, not the UI.",
      "track": { "id": "b2c", "ev_note": "Identical $10,000 first prize to B2B; crowding unknown because the gallery is empty pre-announcement." },
      "demo_moment": "The hired aide's view blocked from a financial document — captioned 'blocked by the database, not the UI'.",
      "scores": [
        { "criterion_id": "technical-implementation", "score": 5, "rationale": "RLS-enforced multi-tenancy, ACID medication transactions, pgvector retrieval under the same policies." },
        { "criterion_id": "design", "score": 5, "rationale": "Calm, accessible, role-scoped views purpose-built for stressed caregivers." },
        { "criterion_id": "impact", "score": 5, "rationale": "2.1 billion people will be 60+ by 2050; dual B2C and B2B monetization." },
        { "criterion_id": "originality", "score": 4, "rationale": "Fair-share visibility and the diaspora digest are fresh; family care records are not new." }
      ],
      "feasibility_hours": 90,
      "total": 4.75,
      "rank": 1
    },
    {
      "id": "idea-09",
      "name": "Daily",
      "pitch": "The social daily-prediction game.",
      "angle": "technical-wow",
      "stage_one": {
        "pass": true,
        "reasons": ["DynamoDB is the primary store", "fits the Million-scale Global track"]
      },
      "thesis": "A once-a-day global write spike with hot-key reads is the access pattern DynamoDB was built for, and the wrong shape for a relational engine.",
      "inversion": "The database is chosen by the access pattern, not the data model.",
      "track": { "id": "million-scale", "ev_note": "Same $10,000 first prize; the architecture story is simpler to demo than to build." },
      "demo_moment": "A live counter of global predictions resolving at the daily cutoff.",
      "scores": [
        { "criterion_id": "technical-implementation", "score": 4, "rationale": "Single-table design with a considered partition key; less depth than a full RLS story." },
        { "criterion_id": "design", "score": 4, "rationale": "Playful and clear, but a narrower surface." },
        { "criterion_id": "impact", "score": 3, "rationale": "Entertainment; real but shallow stakes." },
        { "criterion_id": "originality", "score": 4, "rationale": "Prediction games exist; the daily-global framing is the twist." }
      ],
      "feasibility_hours": 60,
      "total": 3.75,
      "rank": 2
    }
  ],
  "disqualified": [
    {
      "id": "idea-03",
      "name": "PromptShelf",
      "pitch": "A prompt library with semantic search.",
      "stage_one": {
        "pass": false,
        "reasons": [
          "no required AWS database in the design — it stores prompts in a managed vector service",
          "thin wrapper over an existing product category"
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/ideas-schema.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/ideas-schema.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/ideas-schema.mjs`:

```js
export const IDEAS_SCHEMA_VERSION = 1;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Validate a scoring payload. `recon` is optional; when supplied, criterion ids and the
 * score ceiling are cross-checked against the real rubric.
 */
export function validateIdeas(doc, recon) {
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['ideas must be an object'], warnings };
  }
  if (doc.schema_version !== IDEAS_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${IDEAS_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(doc.round) || doc.round < 1) {
    errors.push(`round must be a positive integer, got ${doc.round}`);
  }

  const scored = Array.isArray(doc.ideas) ? doc.ideas : null;
  const rejected = Array.isArray(doc.disqualified) ? doc.disqualified : null;
  if (scored === null) errors.push('ideas must be an array (empty is allowed)');
  if (rejected === null) errors.push('disqualified must be an array (empty is allowed)');
  if (scored === null || rejected === null) return { valid: false, errors, warnings };

  const rubricIds = (recon?.criteria?.items ?? []).map((i) => i.id);
  const maxScore = recon?.criteria?.max_base_score;

  const seenIds = new Set();
  const claimId = (id, where) => {
    if (!isNonEmptyString(id)) { errors.push(`${where}.id must be a non-empty string`); return; }
    if (seenIds.has(id)) errors.push(`${where} has a duplicate id "${id}"`);
    seenIds.add(id);
  };

  for (const [i, idea] of scored.entries()) {
    const where = `ideas[${i}]${idea?.id ? ` (${idea.id})` : ''}`;
    claimId(idea?.id, where);
    if (!isNonEmptyString(idea?.name)) errors.push(`${where}.name must be a non-empty string`);
    if (!isNonEmptyString(idea?.pitch)) errors.push(`${where}.pitch must be a non-empty string`);

    // The gate runs before scoring. Anything here passed it, by definition.
    if (idea?.stage_one?.pass !== true) {
      errors.push(`${where} failed the Stage-One gate and belongs in disqualified, not ideas`);
    }

    // The three tests every winning submission in the corpus passes.
    if (!isNonEmptyString(idea?.thesis)) {
      errors.push(`${where}.thesis must state why this technology, in one line a competitor could not claim`);
    }
    if (!isNonEmptyString(idea?.inversion)) {
      errors.push(`${where}.inversion must state the idea as "X, not Y" in one sentence`);
    }
    if (!isNonEmptyString(idea?.demo_moment)) {
      errors.push(`${where}.demo_moment must name the one thing a judge sees in under three minutes`);
    }
    if (!isNonEmptyString(idea?.track?.id)) {
      errors.push(`${where}.track.id must name the track this idea is entered in`);
    }
    if (idea?.feasibility_hours != null && typeof idea.feasibility_hours !== 'number') {
      errors.push(`${where}.feasibility_hours must be a number when present`);
    }

    validateScores(idea, where, rubricIds, maxScore, errors);
  }

  for (const [i, idea] of rejected.entries()) {
    const where = `disqualified[${i}]${idea?.id ? ` (${idea.id})` : ''}`;
    claimId(idea?.id, where);
    if (!isNonEmptyString(idea?.name)) errors.push(`${where}.name must be a non-empty string`);
    if (idea?.stage_one?.pass !== false) {
      errors.push(`${where} is in disqualified and must record stage_one.pass = false`);
    }
    if (!Array.isArray(idea?.stage_one?.reasons) || idea.stage_one.reasons.length === 0) {
      errors.push(`${where} must give at least one reason for the disqualification`);
    }
    if (idea?.scores !== undefined) {
      errors.push(
        `${where} must not carry scores — a disqualified idea is never scored, because a `
        + 'number invites falling in love with an idea that cannot win',
      );
    }
  }

  const ranks = scored.map((i) => i?.rank).sort((a, b) => a - b);
  if (!ranks.every((r, i) => r === i + 1)) {
    errors.push(`ideas ranks must be contiguous 1..${scored.length}, got ${ranks.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateScores(idea, where, rubricIds, maxScore, errors) {
  const scores = idea?.scores;
  if (!Array.isArray(scores) || scores.length === 0) {
    errors.push(`${where}.scores must be a non-empty array`);
    return;
  }

  const seen = new Set();
  for (const [j, s] of scores.entries()) {
    const at = `${where}.scores[${j}]`;
    if (!isNonEmptyString(s?.criterion_id)) {
      errors.push(`${at}.criterion_id must be a non-empty string`);
      continue;
    }
    if (seen.has(s.criterion_id)) {
      errors.push(`${at} is a duplicate score for criterion "${s.criterion_id}"`);
    }
    seen.add(s.criterion_id);

    if (rubricIds.length > 0 && !rubricIds.includes(s.criterion_id)) {
      errors.push(`${at}.criterion_id "${s.criterion_id}" is not in the rubric (${rubricIds.join(', ')})`);
    }
    if (typeof s.score !== 'number' || Number.isNaN(s.score)) {
      errors.push(`${at}.score must be a number, got "${s.score}"`);
    } else if (typeof maxScore === 'number' && (s.score < 0 || s.score > maxScore)) {
      errors.push(`${at}.score ${s.score} is out of range 0..${maxScore} (max_base_score)`);
    }
    if (!isNonEmptyString(s?.rationale)) {
      errors.push(`${at}.rationale must say why, not just how much`);
    }
  }

  if (rubricIds.length > 0) {
    const missing = rubricIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      errors.push(`${where} must score every criterion in the rubric; missing: ${missing.join(', ')}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/ideas-schema.test.mjs`
Expected: PASS, 21 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ideas-schema.mjs tests/lib/ideas-schema.test.mjs tests/fixtures/h0-ideas.json
git commit -m "feat: add the ideas scoring contract, gating Stage-One failures out of scoring"
```

---

### Task 6: Rendering ideas and the `:brainstorm` CLI

**Files:**
- Modify: `scripts/lib/render-artifacts.mjs`
- Create: `scripts/lib/brainstorm-apply.mjs`
- Create: `scripts/brainstorm.mjs`
- Test: `tests/lib/render-artifacts.test.mjs` (extend)
- Test: `tests/lib/brainstorm-apply.test.mjs`

**Interfaces:**
- Consumes: `validateIdeas` (Task 5); `readState`, `writeState`, `migrateStateFile` (Task 1); `ideasPath`, `roundPath` (Task 1).
- Produces:
  - `renderIdeas(doc, recon?): string` from `render-artifacts.mjs`
  - `nextRoundNumber(root): Promise<number>`, `archiveRound(root): Promise<{round, moved: string[]}>`,
    `applyIdeas(root, doc): Promise<{artifacts: string[]}>` from `brainstorm-apply.mjs`
  - CLI: `node scripts/brainstorm.mjs validate <path> [--recon <path>] [--json]`,
    `node scripts/brainstorm.mjs archive <root>`, `node scripts/brainstorm.mjs apply <root>`

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/render-artifacts.test.mjs`:

```js
import { renderIdeas } from '../../scripts/lib/render-artifacts.mjs';

async function goldenIdeas() {
  const raw = await readFile(new URL('../fixtures/h0-ideas.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('the shortlist uses the scannable one-line format', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  // "N. Name — pitch · Track · Primary tech" — the format that survived real use.
  assert.match(out, /1\. \*\*CareCircle\*\* — One shared record for everyone caring for someone\. · b2c/);
});

test('the shortlist is ordered by rank', async () => {
  const d = await goldenIdeas();
  d.ideas.reverse();
  const out = renderIdeas(d, await golden());
  assert.ok(out.indexOf('CareCircle') < out.indexOf('Daily'));
});

test('every scored idea shows its thesis, inversion and demo moment', async () => {
  const d = await goldenIdeas();
  const out = renderIdeas(d, await golden());
  for (const idea of d.ideas) {
    assert.ok(out.includes(idea.thesis), `missing thesis for ${idea.name}`);
    assert.ok(out.includes(idea.inversion), `missing inversion for ${idea.name}`);
    assert.ok(out.includes(idea.demo_moment), `missing demo moment for ${idea.name}`);
  }
});

test('disqualified ideas are listed with their reasons, not hidden', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  assert.match(out, /PromptShelf/);
  assert.match(out, /Disqualified/);
  assert.match(out, /no required AWS database/);
});

test('disqualified ideas never show a score', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  const section = out.slice(out.indexOf('Disqualified'));
  assert.doesNotMatch(section, /\btotal\b/i);
});

test('the round number appears so preserved rounds are distinguishable', async () => {
  const d = await goldenIdeas();
  d.round = 3;
  assert.match(renderIdeas(d, await golden()), /[Rr]ound 3/);
});

test('a round with nothing scored says so plainly', async () => {
  const d = await goldenIdeas();
  d.ideas = [];
  const out = renderIdeas(d, await golden());
  assert.match(out, /No idea (survived|passed)/i);
  assert.doesNotMatch(out, /undefined/);
});

test('renderIdeas works without a rubric', async () => {
  const out = renderIdeas(await goldenIdeas());
  assert.ok(out.length > 0);
  assert.doesNotMatch(out, /undefined/);
});
```

Create `tests/lib/brainstorm-apply.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from '../helpers/tmp.mjs';
import { nextRoundNumber, archiveRound, applyIdeas } from '../../scripts/lib/brainstorm-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';

async function goldenIdeas() {
  const raw = await readFile(new URL('../fixtures/h0-ideas.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function seed(dir) {
  await writeState(dir, createDefaultState({ pluginVersion: '0.1.0' }));
}

test('the first round is round 1', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    assert.equal(await nextRoundNumber(dir), 1);
  });
});

test('the round number advances past preserved rounds', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    await writeFile(path.join(dir, '.hackathon/ideas-round-1.md'), '#', 'utf8');
    await writeFile(path.join(dir, '.hackathon/ideas-round-2.md'), '#', 'utf8');
    assert.equal(await nextRoundNumber(dir), 3);
  });
});

test('archiveRound preserves the current round under a numbered name', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());

    const { round, moved } = await archiveRound(dir);
    assert.equal(round, 1);
    assert.equal(moved.length, 2);
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.md')));
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.json')));
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.md')), false);
  });
});

test('archiveRound is a no-op when there is no current round', async () => {
  await withTmpDir(async (dir) => {
    await mkdir(path.join(dir, '.hackathon'), { recursive: true });
    assert.deepEqual(await archiveRound(dir), { round: null, moved: [] });
  });
});

test('archiveRound never overwrites an existing preserved round', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());
    await archiveRound(dir);
    await applyIdeas(dir, await goldenIdeas());
    const { round } = await archiveRound(dir);
    assert.equal(round, 2);
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-1.md')));
    assert.ok(await exists(path.join(dir, '.hackathon/ideas-round-2.md')));
  });
});

test('applyIdeas writes both artifacts and leaves the phase awaiting approval', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const { artifacts } = await applyIdeas(dir, await goldenIdeas());
    assert.deepEqual(artifacts.sort(), ['.hackathon/ideas.json', '.hackathon/ideas.md']);

    const state = await readState(dir);
    assert.equal(state.phases.brainstorm.status, 'awaiting_approval');
    assert.deepEqual(state.phases.brainstorm.artifacts.sort(), artifacts.sort());
    assert.equal(state.phases.brainstorm.rounds, 1);
  });
});

test('applyIdeas increments the round count across rounds', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    await applyIdeas(dir, await goldenIdeas());
    await archiveRound(dir);
    const second = await goldenIdeas();
    second.round = 2;
    await applyIdeas(dir, second);
    assert.equal((await readState(dir)).phases.brainstorm.rounds, 2);
  });
});

test('applyIdeas refuses an invalid payload and writes nothing', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const bad = await goldenIdeas();
    bad.ideas[0].thesis = '';
    await assert.rejects(() => applyIdeas(dir, bad), /thesis/);
    assert.equal(await exists(path.join(dir, '.hackathon/ideas.md')), false);
    assert.equal((await readState(dir)).phases.brainstorm.status, 'not_started');
  });
});

test('applyIdeas cross-checks against recon.json when it is present', async () => {
  await withTmpDir(async (dir) => {
    await seed(dir);
    const recon = JSON.parse(
      await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8'),
    );
    await writeFile(path.join(dir, '.hackathon/recon.json'), JSON.stringify(recon), 'utf8');

    const bad = await goldenIdeas();
    bad.ideas[0].scores[0].criterion_id = 'vibes';
    await assert.rejects(() => applyIdeas(dir, bad), /vibes/);
  });
});

test('applyIdeas requires state to exist', async () => {
  await withTmpDir(async (dir) => {
    await assert.rejects(() => applyIdeas(dir, await goldenIdeas()), /init/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/render-artifacts.test.mjs tests/lib/brainstorm-apply.test.mjs`
Expected: FAIL — `renderIdeas` is not exported; `brainstorm-apply.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/lib/render-artifacts.mjs`:

```js
export function renderIdeas(doc, recon) {
  const items = [...(doc.ideas ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const out = [];

  out.push(`# Ideas — round ${doc.round ?? 1}`);
  out.push('');
  if (recon?.identity?.name) out.push(`For **${recon.identity.name}**.`);
  out.push(
    'Every idea below cleared the Stage-One gate before it was scored. '
    + 'Disqualified ideas are listed at the end, with reasons and no numbers.',
  );
  out.push('');

  if (items.length === 0) {
    out.push('## Shortlist');
    out.push('');
    out.push('**No idea survived the Stage-One gate this round.** That is a real result, not a failure of the run — see the disqualified list below and start a fresh round with `--fresh`.');
    out.push('');
  } else {
    out.push('## Shortlist');
    out.push('');
    for (const idea of items) {
      const tech = idea.primary_tech ? ` · ${idea.primary_tech}` : '';
      out.push(`${idea.rank}. **${idea.name}** — ${idea.pitch} · ${idea.track?.id ?? 'no track'}${tech}`);
    }
    out.push('');

    out.push('## The ideas in full');
    out.push('');
    for (const idea of items) {
      out.push(`### ${idea.rank}. ${idea.name}`);
      out.push('');
      out.push(`*${idea.pitch}*`);
      out.push('');
      out.push(`- **Thesis** — ${idea.thesis}`);
      out.push(`- **Inversion** — ${idea.inversion}`);
      out.push(`- **Demo moment** — ${idea.demo_moment}`);
      out.push(`- **Track** — \`${idea.track?.id ?? '?'}\`${idea.track?.ev_note ? ` — ${idea.track.ev_note}` : ''}`);
      if (idea.angle) out.push(`- **Angle** — ${idea.angle}`);
      if (idea.feasibility_hours != null) out.push(`- **Feasibility** — ~${idea.feasibility_hours}h`);
      out.push('');
      out.push('| Criterion | Score | Why |');
      out.push('|---|---|---|');
      for (const s of idea.scores ?? []) {
        const name = (recon?.criteria?.items ?? []).find((c) => c.id === s.criterion_id)?.name
          ?? s.criterion_id;
        out.push(`| ${cell(name)} | ${s.score} | ${cell(s.rationale)} |`);
      }
      if (idea.total != null) {
        const max = recon?.criteria?.max_base_score;
        out.push(`| **Total** | **${idea.total}${max ? ` / ${max}` : ''}** | |`);
      }
      out.push('');
    }
  }

  const rejected = doc.disqualified ?? [];
  if (rejected.length > 0) {
    out.push('## Disqualified at Stage One');
    out.push('');
    out.push('Not scored. A number on a non-compliant idea only makes it harder to let go of.');
    out.push('');
    for (const idea of rejected) {
      out.push(`### ${idea.name}`);
      out.push('');
      if (idea.pitch) {
        out.push(`*${idea.pitch}*`);
        out.push('');
      }
      for (const r of idea.stage_one?.reasons ?? []) out.push(`- ${r}`);
      out.push('');
    }
  }

  return `${out.join('\n').trimEnd()}\n`;
}
```

Create `scripts/lib/brainstorm-apply.mjs`:

```js
import { writeFile, mkdir, readdir, rename, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateIdeas } from './ideas-schema.mjs';
import { renderIdeas } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, IDEAS_FILE, RECON_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;
const ROUND_RE = /^ideas-round-(\d+)\.(md|json)$/;

/** One past the highest preserved round, so archiving never overwrites history. */
export async function nextRoundNumber(root) {
  let entries;
  try {
    entries = await readdir(path.join(root, HACKATHON_DIR));
  } catch {
    return 1;
  }
  const highest = entries.reduce((max, name) => {
    const m = name.match(ROUND_RE);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return highest + 1;
}

/** Move the current round aside so `--fresh` can start clean without losing anything. */
export async function archiveRound(root) {
  const dir = path.join(root, HACKATHON_DIR);
  const round = await nextRoundNumber(root);
  const moved = [];

  for (const [from, to] of [
    ['ideas.md', `ideas-round-${round}.md`],
    [IDEAS_FILE, `ideas-round-${round}.json`],
  ]) {
    try {
      await rename(path.join(dir, from), path.join(dir, to));
      moved.push(rel(to));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return moved.length === 0 ? { round: null, moved: [] } : { round, moved };
}

async function readReconIfPresent(root) {
  try {
    return JSON.parse(await readFile(path.join(root, HACKATHON_DIR, RECON_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

export async function applyIdeas(root, doc) {
  const recon = await readReconIfPresent(root);
  const { valid, errors } = validateIdeas(doc, recon);
  if (!valid) {
    throw new Error(`refusing to apply an invalid ideas payload:\n  ${errors.join('\n  ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });

  const files = [
    [IDEAS_FILE, `${JSON.stringify(doc, null, 2)}\n`],
    ['ideas.md', renderIdeas(doc, recon)],
  ];
  for (const [name, body] of files) await writeFile(path.join(dir, name), body, 'utf8');
  const artifacts = files.map(([name]) => rel(name));

  await writeState(root, {
    ...state,
    phases: {
      ...state.phases,
      brainstorm: {
        ...state.phases.brainstorm,
        status: 'awaiting_approval',
        artifacts,
        rounds: doc.round ?? 1,
      },
    },
  });

  return { artifacts };
}
```

Create `scripts/brainstorm.mjs`:

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateIdeas } from './lib/ideas-schema.mjs';
import { applyIdeas, archiveRound } from './lib/brainstorm-apply.mjs';
import { ideasPath, reconPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: brainstorm.mjs validate <path-to-ideas.json> [--recon <path>] [--json]');
  console.error('       brainstorm.mjs archive <project-root>');
  console.error('       brainstorm.mjs apply <project-root> [--ideas <path>]');
  process.exit(2);
}

async function readJson(p, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (optional && err.code === 'ENOENT') return undefined;
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'validate') {
  if (!target) usage();
  const doc = await readJson(path.resolve(target));
  const idx = rest.indexOf('--recon');
  const recon = idx === -1 ? undefined : await readJson(path.resolve(rest[idx + 1]));
  const result = validateIdeas(doc, recon);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  if (result.valid) {
    console.log('ideas.json is valid.');
    process.exit(0);
  }
  console.error(`ideas.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'archive') {
  const root = target ? path.resolve(target) : process.cwd();
  const { round, moved } = await archiveRound(root);
  if (round === null) {
    console.log('Nothing to archive — no current round on disk.');
  } else {
    console.log(`Preserved round ${round}:`);
    for (const m of moved) console.log(`  ${m}`);
  }
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--ideas');
  const source = idx === -1 ? ideasPath(root) : path.resolve(rest[idx + 1]);
  const doc = await readJson(source);

  try {
    const { artifacts } = await applyIdeas(root, doc);
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    console.log(`\nRubric: ${reconPath(root)}`);
    console.log('Phase "brainstorm" is now awaiting_approval. Present the shortlist and ask which idea to take.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/render-artifacts.test.mjs tests/lib/brainstorm-apply.test.mjs`
Expected: PASS, 25 + 10 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render-artifacts.mjs scripts/lib/brainstorm-apply.mjs scripts/brainstorm.mjs \
        tests/lib/render-artifacts.test.mjs tests/lib/brainstorm-apply.test.mjs
git commit -m "feat: render the idea shortlist and add the :brainstorm CLI with round preservation"
```

---

### Task 7: The `:describe` CLI — scaffold and apply

**Files:**
- Create: `scripts/lib/describe-apply.mjs`
- Create: `scripts/describe.mjs`
- Test: `tests/lib/describe-apply.test.mjs`

**Interfaces:**
- Consumes: `renderCriteriaMap`, `TIEBREAK_MARKER` (Task 3); `readState`, `writeState`, `migrateStateFile` (Task 1).
- Produces:
  - `buildHeadingPlan(recon): Array<{criterion_id, heading, inserted}>`
  - `buildBonusPlan(recon): Array<{id, status, kind, platform, angle, url}>`
  - `renderStrategySkeleton({recon, idea}): string`
  - `applyDescribe(root, { ideaId, trackId }): Promise<{artifacts, bonusSlots}>`
  - CLI: `node scripts/describe.mjs scaffold <root> --idea <id>` and
    `node scripts/describe.mjs apply <root> --idea <id> --track <track-id>`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/describe-apply.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/describe-apply.test.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/describe-apply.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/describe-apply.mjs`:

```js
import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { renderCriteriaMap } from './render-artifacts.mjs';
import { readState, writeState, migrateStateFile } from './state.mjs';
import { HACKATHON_DIR, RECON_FILE, IDEAS_FILE, statePath } from './paths.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;
const byRank = (items = []) => [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

/**
 * One submission heading per judging criterion. Devpost's seven default headings are the
 * baseline; anything else is an insertion, and insertions are what winners use to put
 * their strongest card where a skimming judge cannot miss it.
 */
export function buildHeadingPlan(recon) {
  const defaults = (recon.submission_form?.fields ?? [])
    .find((f) => f.id === 'about')?.default_headings ?? [];

  const SUGGESTED = {
    'technical-implementation': 'How we built it',
    design: 'Design decisions',
    impact: 'Impact',
    originality: 'What makes it original',
  };

  return byRank(recon.criteria?.items).map((c) => {
    const heading = SUGGESTED[c.id] ?? c.name;
    return { criterion_id: c.id, heading, inserted: !defaults.includes(heading) };
  });
}

export function buildBonusPlan(recon) {
  const b = recon.bonus;
  if (!b?.available) return [];
  const per = b.per_item_points || b.max_points || 0;
  const slots = per > 0 ? Math.round((b.max_points ?? 0) / per) : 0;
  return Array.from({ length: slots }, (_, i) => ({
    id: `bonus-${i + 1}`,
    status: 'not_started',
    kind: (b.kinds ?? [])[0] ?? null,
    platform: null,
    angle: null,
    url: null,
  }));
}

export function renderStrategySkeleton({ recon, idea }) {
  const out = [];
  const headings = buildHeadingPlan(recon);
  const bonus = recon.bonus;

  out.push(`# ${idea.name} — how we win`);
  out.push('');
  out.push(`For **${recon.identity?.name ?? 'this hackathon'}**. Track: \`${idea.track?.id ?? '?'}\`.`);
  out.push('');

  out.push('## The thesis');
  out.push('');
  out.push(`> ${idea.thesis}`);
  out.push('');
  out.push(`**Stated as an inversion:** ${idea.inversion}`);
  out.push('');
  out.push(
    'This sentence is the single most load-bearing line in the submission. Every winner '
    + 'in the reference corpus has one, and the ones that took first place in a track gave '
    + 'it a **top-level heading high in the document** rather than burying it inside "How '
    + 'we built it". Promote it.',
  );
  out.push('');

  out.push('## Criteria map');
  out.push('');
  out.push('One row per judging criterion. Rows come from the rubric, so this table cannot drift from `criteria.md`.');
  out.push('');
  out.push(renderCriteriaMap(recon).trimEnd());
  out.push('');

  out.push('## Heading plan');
  out.push('');
  out.push('At least one submission heading per criterion. Insertions go beyond Devpost\'s defaults.');
  out.push('');
  out.push('| Criterion | Heading | Insertion? |');
  out.push('|---|---|---|');
  for (const h of headings) {
    out.push(`| \`${h.criterion_id}\` | ${h.heading} | ${h.inserted ? 'yes — added' : 'no — a Devpost default'} |`);
  }
  out.push('');

  out.push('## Track choice');
  out.push('');
  out.push(`Entered in \`${idea.track?.id ?? '?'}\`. ${idea.track?.ev_note ?? ''}`.trim());
  if (recon.prize_rules?.one_prize_per_project) {
    out.push('');
    out.push('Each project may win exactly one prize, so this is a single bet, not a hedge.');
  }
  if (recon.landscape?.gallery_available !== true) {
    out.push('');
    out.push(
      '_Crowding per track is unknown: Devpost galleries stay empty until winners are '
      + 'announced. This choice rests on prize structure and fit, not on observed field size._',
    );
  }
  out.push('');

  out.push('## The demo moment');
  out.push('');
  out.push(`> ${idea.demo_moment}`);
  out.push('');
  out.push('Three-minute shot skeleton — fill in timings:');
  out.push('');
  out.push('1. **0:00–0:25 — the ache.** The problem, human, before any UI.');
  out.push('2. **0:25–1:30 — the product.** The happy path, ending on the demo moment above.');
  out.push('3. **1:30–2:15 — why it is safe and smart.** The engineering the judges are hired to notice.');
  out.push('4. **2:15–2:50 — the architecture.** Name the required technology out loud and say why this one.');
  out.push('5. **2:50–3:00 — the vision.** One number, one sentence.');
  out.push('');

  if (bonus?.available) {
    out.push('## Bonus contributions');
    out.push('');
    out.push(
      `Up to **+${bonus.max_points}** (${bonus.per_item_points} each), raising the ceiling to `
      + `**${bonus.max_score_with_bonus}**. Most entrants skip this.`,
    );
    out.push('');
    for (const slot of buildBonusPlan(recon)) {
      out.push(`- \`${slot.id}\` — _angle to be chosen_ · platform: _to be chosen_`);
    }
    out.push('');
    out.push(`**Required disclosure, verbatim:** ${bonus.required_disclosure}`);
    if (bonus.hashtag) out.push(`**Hashtag:** ${bonus.hashtag}`);
    out.push('');
  }

  out.push('## Risks and mitigations');
  out.push('');
  out.push('| Risk | Mitigation |');
  out.push('|---|---|');
  out.push('| _to be written_ | _to be written_ |');
  out.push('');

  return `${out.join('\n').trimEnd()}\n`;
}

function renderProjectOutline(idea) {
  return `# ${idea.name}

> ${idea.pitch}

## TL;DR

_The elevator pitch, in a paragraph a judge can read in twenty seconds._

## The problem — and why now

_Real stakes, a named audience, and what changed recently that makes this the moment._

## The insight

_Two extremes that exist today, and the underserved middle this occupies._

## Who it's for

| Persona | Who they are | What they need |
|---|---|---|
| _to be written_ | | |

## What it does

_Features grouped by pillar, not a flat list._

## A day in the life

_A narrative with **named characters**. These names are load-bearing: they become the
seeded demo data, the demo video script, and the submission narrative. Later phases reuse
them exactly._

## Product principles

_The design philosophy that makes this unmistakably for this audience._

## Limitations and what's out of scope

_Mandatory. These become the "What's next" section of the submission._
`;
}

export async function applyDescribe(root, { ideaId, trackId }) {
  const dir = path.join(root, HACKATHON_DIR);

  let recon;
  try {
    recon = JSON.parse(await readFile(path.join(dir, RECON_FILE), 'utf8'));
  } catch {
    throw new Error(`no ${rel(RECON_FILE)} — run /win-hackathon:recon first`);
  }

  let ideasDoc;
  try {
    ideasDoc = JSON.parse(await readFile(path.join(dir, IDEAS_FILE), 'utf8'));
  } catch {
    throw new Error(`no ${rel(IDEAS_FILE)} — run /win-hackathon:brainstorm first`);
  }

  const idea = (ideasDoc.ideas ?? []).find((i) => i.id === ideaId);
  if (!idea) {
    const wasRejected = (ideasDoc.disqualified ?? []).some((i) => i.id === ideaId);
    throw new Error(
      wasRejected
        ? `idea "${ideaId}" was disqualified at Stage One and cannot be built`
        : `no idea "${ideaId}" in ${rel(IDEAS_FILE)}`,
    );
  }

  const trackIds = (recon.tracks ?? []).map((t) => t.id);
  if (trackIds.length > 0 && !trackIds.includes(trackId)) {
    throw new Error(`track "${trackId}" is not one of: ${trackIds.join(', ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);

  await mkdir(dir, { recursive: true });
  const files = [
    ['project.md', renderProjectOutline(idea)],
    ['strategy.md', renderStrategySkeleton({ recon, idea: { ...idea, track: { ...idea.track, id: trackId } } })],
  ];
  for (const [name, body] of files) await writeFile(path.join(dir, name), body, 'utf8');
  const artifacts = files.map(([name]) => rel(name));

  // Re-running :describe (to change track, say) must not un-publish a bonus piece.
  const existingBonus = state.deliverables?.bonus_content ?? [];
  const byId = new Map(existingBonus.map((b) => [b.id, b]));
  const bonus = buildBonusPlan(recon).map((slot) => byId.get(slot.id) ?? slot);

  await writeState(root, {
    ...state,
    project: { ...state.project, name: idea.name, selected_idea: idea.id },
    hackathon: { ...state.hackathon, selected_track: trackId },
    deliverables: { ...state.deliverables, bonus_content: bonus },
    phases: {
      ...state.phases,
      describe: { ...state.phases.describe, status: 'awaiting_approval', artifacts },
    },
  });

  return { artifacts, bonusSlots: bonus.length };
}
```

Create `scripts/describe.mjs`:

```js
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyDescribe, renderStrategySkeleton } from './lib/describe-apply.mjs';
import { reconPath, ideasPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);

function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? null : rest[i + 1] ?? null;
}

function usage() {
  console.error('usage: describe.mjs scaffold <project-root> --idea <idea-id>');
  console.error('       describe.mjs apply    <project-root> --idea <idea-id> --track <track-id>');
  process.exit(2);
}

const root = target ? path.resolve(target) : process.cwd();

if (subcommand === 'scaffold') {
  const ideaId = flag('idea');
  if (!ideaId) usage();
  try {
    const recon = JSON.parse(await readFile(reconPath(root), 'utf8'));
    const doc = JSON.parse(await readFile(ideasPath(root), 'utf8'));
    const idea = (doc.ideas ?? []).find((i) => i.id === ideaId);
    if (!idea) throw new Error(`no idea "${ideaId}" in ${ideasPath(root)}`);
    console.log(renderStrategySkeleton({ recon, idea }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else if (subcommand === 'apply') {
  const ideaId = flag('idea');
  const trackId = flag('track');
  if (!ideaId || !trackId) usage();
  try {
    const { artifacts, bonusSlots } = await applyDescribe(root, { ideaId, trackId });
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    if (bonusSlots > 0) console.log(`Opened ${bonusSlots} bonus-content slot(s) in state.`);
    console.log('\nPhase "describe" is now awaiting_approval. Read the thesis aloud before asking.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/describe-apply.test.mjs`
Expected: PASS, 16 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/describe-apply.mjs scripts/describe.mjs tests/lib/describe-apply.test.mjs
git commit -m "feat: add the :describe CLI producing project.md and a strategy skeleton"
```

---

### Task 8: Status board and SessionStart hook updates

**Files:**
- Modify: `scripts/lib/render.mjs:28-41`
- Modify: `hooks/inject-state.mjs:44-47`
- Test: `tests/lib/render.test.mjs` (extend)
- Test: `tests/hooks/inject-state.test.mjs` (extend)

**Interfaces:**
- Consumes: `state.deliverables` and `state.hackathon.next_action_deadline` (Task 1).
- Produces: no new exports. `renderStatusBoard` gains a deliverables section and an action-deadline line; the hook gains one line for the next action deadline and one for the tiebreak-first criterion.

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/render.test.mjs`:

```js
function stateWithDeliverables() {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.hackathon = {
    name: 'H0', url: 'https://h01.devpost.com',
    deadline: '2026-06-29T17:00:00-07:00',
    next_action_deadline: { label: 'credit request form closes', at: '2026-06-26T12:00:00-07:00' },
    tech: { required: ['AWS Database'], bonus: [], forbidden: [] },
    criteria_ids: ['technical-implementation', 'design'],
    tiebreak: 'listed_order', bonus_points_available: 0.6,
    selected_track: 'b2c', recon_ref: '.hackathon/recon.json',
  };
  s.deliverables = {
    submission_requirements: [
      { id: 'demo-video', status: 'not_started' },
      { id: 'architecture-diagram', status: 'done' },
    ],
    bonus_content: [{ id: 'bonus-1', status: 'not_started', url: null }],
  };
  return s;
}

const resolution = { outcome: 'start', phase: 'stack', drift: [], reason: 'Phase "stack" is next.' };

test('the board counts outstanding submission requirements', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /Deliverables/);
  assert.match(out, /1 of 2/);
});

test('the board names the outstanding items, not just a count', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /demo-video/);
});

test('the board does not nag about deliverables already done', () => {
  const s = stateWithDeliverables();
  for (const d of s.deliverables.submission_requirements) d.status = 'done';
  s.deliverables.bonus_content = [];
  const out = renderStatusBoard({ state: s, resolution, tools: [] });
  assert.doesNotMatch(out, /architecture-diagram/);
});

test('the board surfaces the next action deadline separately from the submission deadline', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /credit request form closes/);
  assert.match(out, /2026-06-26/);
});

test('the board shows unclaimed bonus points as points, not as a task', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /\+0\.6|0\.6 bonus/i);
});

test('the board shows the selected track once one is chosen', () => {
  const out = renderStatusBoard({ state: stateWithDeliverables(), resolution, tools: [] });
  assert.match(out, /b2c/);
});

test('the board omits the deliverables section entirely before recon', () => {
  const out = renderStatusBoard({
    state: createDefaultState({ pluginVersion: '0.1.0' }), resolution, tools: [],
  });
  assert.doesNotMatch(out, /Deliverables/);
  assert.doesNotMatch(out, /undefined/);
});
```

Append to `tests/hooks/inject-state.test.mjs`. The file already imports everything needed
(`test`, `assert`, `execFile`, `promisify`, `fileURLToPath`, `writeFile`, `mkdir`, `path`,
`withTmpDir`, `writeState`, `createDefaultState`) and already declares `const run` and
`const hook` — **add no imports**. The hook is invoked exactly as the existing tests do it:
`await run('node', [hook], { cwd: dir })`.

Note the deadlines below are in 2099 on purpose: the hook prints hours remaining, and a
past date would make the assertions depend on when the suite runs.

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lib/render.test.mjs tests/hooks/inject-state.test.mjs`
Expected: FAIL — no "Deliverables" section, no action-deadline line, no tiebreak line.

- [ ] **Step 3: Write minimal implementation**

In `scripts/lib/render.mjs`, insert this block into `renderStatusBoard` immediately after
the existing budget block (which ends at line 32) and before the missing-tools block:

```js
  if (state.hackathon?.selected_track) {
    lines.push('');
    lines.push(`Track: ${state.hackathon.selected_track}`);
  }

  // An action deadline closes before the work is due — missing it costs a resource,
  // not the hackathon, which is exactly why it is easy to forget.
  const action = state.hackathon?.next_action_deadline;
  if (action) {
    lines.push('');
    lines.push(`Next action deadline: ${action.at} — ${action.label}`);
  }

  const reqs = state.deliverables?.submission_requirements ?? [];
  const bonusItems = state.deliverables?.bonus_content ?? [];
  const openReqs = reqs.filter((d) => d.status !== 'done' && d.status !== 'skipped');
  const openBonus = bonusItems.filter((d) => d.status !== 'done' && d.status !== 'skipped');

  if (reqs.length > 0 || bonusItems.length > 0) {
    lines.push('');
    lines.push('Deliverables');
    if (reqs.length > 0) {
      lines.push(`  submission requirements: ${reqs.length - openReqs.length} of ${reqs.length} done`);
      for (const d of openReqs) lines.push(`    [ ] ${d.id}`);
    }
    if (openBonus.length > 0) {
      const points = state.hackathon?.bonus_points_available ?? 0;
      lines.push(`  bonus content: ${openBonus.length} unpublished — up to +${points} unclaimed`);
    }
  }
```

In `hooks/inject-state.mjs`, replace the deadline block (lines 44–47) with:

```js
  if (state.hackathon?.deadline) {
    const hoursLeft = Math.round((Date.parse(state.hackathon.deadline) - Date.now()) / 3_600_000);
    lines.push(`Deadline: ${oneLine(state.hackathon.deadline)} (~${hoursLeft}h left)`);
  }

  const action = state.hackathon?.next_action_deadline;
  if (action?.at) {
    const h = Math.round((Date.parse(action.at) - Date.now()) / 3_600_000);
    lines.push(`Action deadline: ${oneLine(action.label)} — ${oneLine(action.at)} (~${h}h left)`);
  }

  // Equal weighting does not mean equal value when ties break by listed order.
  const first = state.hackathon?.criteria_ids?.[0];
  if (first && state.hackathon?.tiebreak === 'listed_order') {
    lines.push(`Criteria: ${oneLine(state.hackathon.criteria_ids.join(', '))} — ties break on "${oneLine(first)}" first.`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/render.test.mjs tests/hooks/inject-state.test.mjs`
Expected: PASS. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render.mjs hooks/inject-state.mjs tests/lib/render.test.mjs tests/hooks/inject-state.test.mjs
git commit -m "feat: surface deliverables, action deadlines and the tiebreak criterion in status and the hook"
```

---

### Task 9: Agent definitions

**Files:**
- Create: `agents/hackathon-recon.md`
- Create: `agents/idea-generator.md`
- Create: `agents/idea-scorer.md`
- Test: `tests/agents.test.mjs`

**Interfaces:**
- Consumes: the `recon.json` and `ideas.json` contracts (Tasks 2 and 5) — the agents' whole job is to emit conforming payloads.
- Produces: three agent definitions discoverable by the Task tool. No code exports.

- [ ] **Step 1: Write the failing test**

Create `tests/agents.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const agentsDir = path.join(root, 'agents');

async function agentFiles() {
  return (await readdir(agentsDir)).filter((f) => f.endsWith('.md'));
}
const read = (f) => readFile(path.join(agentsDir, f), 'utf8');

test('the three M2 agents exist', async () => {
  const files = await agentFiles();
  for (const f of ['hackathon-recon.md', 'idea-generator.md', 'idea-scorer.md']) {
    assert.ok(files.includes(f), `missing agents/${f}`);
  }
});

test('every agent has frontmatter with a name, description and tools', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    assert.ok(content.startsWith('---\n'), `${f} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${f} needs a name`);
    assert.match(fm, /description:\s*\S/, `${f} needs a description`);
    assert.match(fm, /tools:\s*\S/, `${f} needs a tools list`);
  }
});

test('every agent filename matches its declared name', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    const name = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(name, f.replace(/\.md$/, ''), `${f} declares name "${name}"`);
  }
});

test('the recon agent is told to return only the payload, never raw HTML', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /recon\.json/);
  // The agent exists so that hundreds of KB of Devpost markup never reach the main
  // context. If it summarises into the conversation instead, it has no reason to exist.
  assert.match(content, /only the JSON|nothing but the JSON|JSON payload and nothing/i);
});

test('the recon agent is told never to guess', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /unresolved/);
  assert.match(content, /never guess|do not guess/i);
});

test('the recon agent knows galleries are empty before announcement', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /until winners are announced/);
});

test('the recon agent requires a quote for every claim', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /quote/);
});

test('the recon agent is told to check pages beyond the rules', async () => {
  const content = await read('hackathon-recon.md');
  for (const p of ['/rules', '/resources', '/updates', '/project-gallery']) {
    assert.ok(content.includes(p), `recon agent should fetch ${p}`);
  }
});

test('the idea generator is given exactly one angle and told not to score', async () => {
  const content = await read('idea-generator.md');
  assert.match(content, /angle/i);
  assert.match(content, /do not score|never score|scoring is not/i);
});

test('the scorer runs the Stage-One gate before scoring', async () => {
  const content = await read('idea-scorer.md');
  assert.match(content, /Stage One/i);
  assert.match(content, /disqualified/);
  assert.match(content, /before/i);
});

test('the scorer applies the inversion and thesis tests', async () => {
  const content = await read('idea-scorer.md');
  assert.match(content, /inversion/i);
  assert.match(content, /thesis/i);
});

test('the scorer is told ties break on the first-ranked criterion', async () => {
  const content = await read('idea-scorer.md');
  assert.match(content, /rank/i);
  assert.match(content, /tie/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agents.test.mjs`
Expected: FAIL — `ENOENT` reading the `agents` directory.

- [ ] **Step 3: Write minimal implementation**

Create `agents/hackathon-recon.md`:

```markdown
---
name: hackathon-recon
description: Reads a Devpost hackathon end to end and returns a validated recon.json. Use for phase 0 of win-hackathon.
tools: WebFetch, Read, Write, Bash
model: opus
---

You extract a hackathon into a single structured payload. You exist so that hundreds of
kilobytes of Devpost markup never reach the main conversation: **you return only the JSON
payload and nothing else** — no summary, no commentary, no prose around it.

## Pages to read

In this order, and do not stop at the first one:

- `/` — the overview: prizes, tracks, judges, criteria summary, participant count
- `/rules` — the official rules: dates, eligibility, submission requirements, tie-breaking,
  bonus mechanics, IP terms
- `/resources` — sponsor and partner sections, and the FAQ
- `/updates` — host-posted clarifications. **A clarification outranks the original rules text.**
- `/project-gallery` — usually empty; see below

Use WebFetch first. If a page is JS-gated or comes back thin, fall back to the Playwright
MCP if it is available. Ask the user to paste the page only as a last resort.

**Two places people forget to look, and both have decided outcomes before:**

1. **Sponsor and partner sections on `/resources` carry their own required-signal lists.**
   These read like documentation but function as requirements — a judge will check for the
   exact attributes named there. Extract them into `submission_requirements` or
   `host_guidance` with a verbatim quote.
2. **The FAQ contains scoring language.** Statements like "submissions with no meaningful
   engineering decisions will score poorly on Technical Implementation" are the host
   telling you the rubric. Capture them in `host_guidance` verbatim.

## The project gallery

Devpost project galleries stay **empty until winners are announced**. During a live
hackathon you cannot observe how crowded a track is. Set `landscape.gallery_available` to
`false` and leave `entries_observed` as `null`. Do not substitute the participant count —
that counts registrations, not submissions.

If the hackathon is one edition of a recurring series, find the prior edition and read
**its** gallery, which will be populated. Record what you find in
`landscape.prior_editions`, including the winners and, where you can read it off their
submissions, the one-line technology thesis each used. That is the most valuable thing on
the page.

## Rules for extraction

- **Every claim carries a verbatim `quote`.** A field without a citation is unverified and
  will be treated as such downstream.
- **Never guess.** If you cannot determine something, add a plain-language sentence to
  `unresolved` and move on. An honest gap is useful; an invented value is dangerous.
- **Dates need an explicit UTC offset**, always. `2026-06-29T17:00:00-07:00`, never
  `2026-06-29T17:00:00`. Convert prose like "June 29, 2026 (5:00 pm Pacific Time)"
  yourself, and be careful across the date line — a deadline shown as "Jun 30 @ 2:00am
  GMT+2" is the same instant as "Jun 29 5:00pm PT".
- **Separate deadline kinds.** `hard` is the submission deadline and there is exactly one.
  `action` is anything with its own earlier cut-off that costs you a resource if missed —
  credit request forms, registration. `informational` is everything else.
- **`criteria.items[].rank` is the listed order** and is load-bearing: when the rules break
  ties by "the first applicable criterion," rank 1 is worth more than its weight.
- **Read the prize table carefully.** Note whether a project may win more than one prize,
  and record every track and open prize with its cash value.
- **Read the judging panel.** Who they are and what they do tells you what the submission
  must lead with. Put that inference in `panel_read` in one or two sentences.
- **Flag ambiguities.** Rules contain copy-paste errors. When a passage contradicts itself,
  record it in `ambiguities` with the likely reading and the remedy the rules provide —
  most Devpost rules invite a written request for clarification before the deadline.

## Output

Write the payload to `.hackathon/recon.json`, then validate it:

    node ${CLAUDE_PLUGIN_ROOT}/scripts/recon.mjs validate .hackathon/recon.json

If validation fails, read every error, fix the payload, and re-validate. Do this at most
twice. If it still fails, return the validation errors rather than a payload you know is
wrong.

Your final message is the path to the validated file and a one-paragraph summary of what
you could not resolve. Nothing else.
```

Create `agents/idea-generator.md`:

```markdown
---
name: idea-generator
description: Generates hackathon project ideas from one assigned angle. Spawned in parallel, one per angle, during win-hackathon phase 1.
tools: Read, Write
model: opus
---

You generate candidate project ideas from **one assigned angle**. Several of you run in
parallel with different angles; one agent producing ten ideas converges on a house style,
four agents diverge, which is the point.

Read `.hackathon/recon.json` first — the criteria, the required technology, the tracks, the
panel read, and the constraints. Everything you propose must be buildable inside the stated
technology requirements.

## Your angle

You will be told which one. Stay in it; another agent covers the others.

- **technical-wow** — the demo that makes a judge lean forward. A hard engineering spine.
- **social-impact** — a real, nameable beneficiary and stakes that matter.
- **sponsor-native** — impossible without the required technology, not merely using it.
- **underserved-niche** — a specific audience nobody builds for.

## What makes an idea worth proposing

Every winner in the reference corpus can be stated as an **inversion** — one sentence of
the form "X, not Y" that reframes the problem:

- the model goes to the data, not the data to the model
- authorization lives in the database, not the UI
- vision is the last resort, not the first tool
- tests check the contract you wrote down; this checks the contract you forgot you had

If you cannot write that sentence for an idea, the idea is not finished. Write it down and
try again, or drop it.

Every winner also has a **thesis**: one line on why *this* required technology, phrased so
that a competitor using a different technology could not claim it. "We used Postgres" is
not a thesis. "Caregiving is relational, transactional and access-controlled, so
authorization belongs in the database" is.

And every winner has one **demo moment** — a single visceral thing a judge sees inside
three minutes. Name it.

## Anti-patterns — do not propose these

Todo apps. Thin chatbot wrappers over documents. "X, but with AI." Anything whose entire
description is a prompt plus a UI. Ideas that would score zero on Originality because the
category already has ten funded companies and you add nothing.

## Output

For each idea: name, a one-line pitch, the problem, the audience, key features, the
thesis, the inversion, the demo moment, a suggested track, the required-technology fit,
and a rough hour estimate.

**Do not score anything.** Scoring happens later, in a fresh context, deliberately
unanchored by your enthusiasm for your own ideas. Return your candidates as structured
notes and stop.
```

Create `agents/idea-scorer.md`:

```markdown
---
name: idea-scorer
description: Gates candidate ideas on Stage One, then scores survivors against the real rubric. Runs in a fresh context during win-hackathon phase 1.
tools: Read, Write
model: opus
---

You rank candidate ideas against the hackathon's actual rubric. You run in a **fresh
context**, having not generated any of these ideas, because a generator scoring its own
output rates enthusiasm rather than fit.

Read `.hackathon/recon.json`: `criteria`, `stage_one`, `tech`, `tracks`, `prize_rules`,
`landscape`, `panel_read`.

## Work in this order. The order is the point.

**1. The Stage-One gate — before any number is written.**

Most hackathons screen on pass/fail before scoring: does the project fit the theme, and
does it genuinely apply the required technology? Apply that gate to every candidate.

An idea that fails goes in `disqualified` with its reasons **and no scores**. Do not score
it "for comparison." A number attached to a non-compliant idea only makes it harder to let
go of, and the validator will reject the payload anyway.

**2. The inversion test.** Can the idea be stated as "X, not Y" in one sentence? Write that
sentence into `inversion`. If you cannot write it, say so in the rationale — an idea with no
inversion will score poorly on Originality and you should say why.

**3. The thesis test.** Is there a one-line justification for the required technology that a
competitor using a different technology could not claim? Write it into `thesis`. This is
also the constructive form of the Stage-One "reasonably applies the required APIs" gate.

**4. The demo moment.** Name the single thing a judge sees in under three minutes. Write it
into `demo_moment`.

**5. Only now, score.** One score per criterion in the rubric, every criterion, with a
rationale that says *why* rather than restating the score. Use the rubric's
`max_base_score` as your ceiling.

## Scoring honestly

- **Ties break on rank.** When `criteria.tiebreak` is `listed_order`, the criterion with
  `rank: 1` decides close calls, so it is worth more than its nominal weight. Reflect that
  when you order the ideas, and say so in the rationale where it changed the ranking.
- **Quote the criterion.** Score against what the host actually wrote, in `quote`, not
  against the criterion's name.
- **Discriminate.** If every idea scores 4 on everything, the ranking is useless. Spread the
  scores. Being wrong and specific is more useful here than being safe and uniform.
- **Track choice is arithmetic where it can be.** Use prize values and
  `prize_rules.one_prize_per_project`. If `landscape.gallery_available` is false, per-track
  crowding is unknown — say that in `ev_note` rather than implying you measured it.
- **The panel read matters.** `panel_read` tells you what this specific set of judges is
  hired to notice. An idea that plays to it scores higher on the criteria they weight.

## Output

Write `.hackathon/ideas.json` conforming to the contract, then validate:

    node ${CLAUDE_PLUGIN_ROOT}/scripts/brainstorm.mjs validate .hackathon/ideas.json --recon .hackathon/recon.json

Fix and re-validate on failure, at most twice. Return the path and a two-sentence summary
of how the top three differ — not a restatement of the scores.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agents.test.mjs`
Expected: PASS, 12 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add agents/ tests/agents.test.mjs
git commit -m "feat: add the recon, idea-generator and idea-scorer agent definitions"
```

---

### Task 10: The process skills — recon, scoring, description

**Files:**
- Create: `skills/devpost-recon/SKILL.md`
- Create: `skills/judging-criteria-scoring/SKILL.md`
- Create: `skills/project-description/SKILL.md`
- Test: `tests/skills.test.mjs`

**Interfaces:**
- Consumes: nothing at runtime; these are loaded by the commands in Task 12.
- Produces: three skill directories. The test file created here is extended by Task 11.

- [ ] **Step 1: Write the failing test**

Create `tests/skills.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = path.join(root, 'skills');

async function skillNames() {
  const entries = await readdir(skillsDir);
  const names = [];
  for (const e of entries) {
    if ((await stat(path.join(skillsDir, e))).isDirectory()) names.push(e);
  }
  return names;
}
const readSkill = (name) => readFile(path.join(skillsDir, name, 'SKILL.md'), 'utf8');

test('the M2 process skills exist', async () => {
  const names = await skillNames();
  for (const n of ['devpost-recon', 'judging-criteria-scoring', 'project-description']) {
    assert.ok(names.includes(n), `missing skills/${n}`);
  }
});

test('every skill has frontmatter with a name and a description', async () => {
  for (const n of await skillNames()) {
    const content = await readSkill(n);
    assert.ok(content.startsWith('---\n'), `${n} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${n} needs a name`);
    assert.match(fm, /description:\s*\S/, `${n} needs a description`);
  }
});

test('every skill directory name matches its declared name', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4);
    const declared = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(declared, n);
  }
});

test('every skill description says when to use it, not just what it is', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4, (await readSkill(n)).indexOf('\n---', 4));
    const desc = fm.match(/description:\s*(.+)/)[1];
    assert.ok(desc.length > 40, `${n}'s description is too thin to route on: "${desc}"`);
  }
});

test('devpost-recon names the pages that are easy to miss', async () => {
  const content = await readSkill('devpost-recon');
  for (const p of ['/updates', '/project-gallery', '/resources']) {
    assert.ok(content.includes(p), `devpost-recon should cover ${p}`);
  }
  assert.match(content, /until winners are announced/);
});

test('devpost-recon covers partner pages and FAQ scoring language', async () => {
  const content = await readSkill('devpost-recon');
  assert.match(content, /partner|sponsor section/i);
  assert.match(content, /FAQ/);
});

test('devpost-recon covers dated actions and rule ambiguities', async () => {
  const content = await readSkill('devpost-recon');
  assert.match(content, /action/i);
  assert.match(content, /ambigu/i);
  assert.match(content, /clarification/i);
});

test('judging-criteria-scoring covers all four scoring mechanics', async () => {
  const content = await readSkill('judging-criteria-scoring');
  assert.match(content, /Stage One/i);
  assert.match(content, /tie/i);
  assert.match(content, /bonus/i);
  assert.match(content, /expected value|EV/i);
});

test('judging-criteria-scoring is honest about unobservable crowding', async () => {
  const content = await readSkill('judging-criteria-scoring');
  assert.match(content, /gallery/i);
  assert.match(content, /cannot|unknown|unobservable/i);
});

test('project-description carries the section spine and the named-characters rule', async () => {
  const content = await readSkill('project-description');
  assert.match(content, /why now/i);
  assert.match(content, /day in the life/i);
  assert.match(content, /named/i);
  assert.match(content, /seed data|seeded/i);
});

test('project-description carries the heading-per-criterion rule', async () => {
  const content = await readSkill('project-description');
  assert.match(content, /heading/i);
  assert.match(content, /criterion|criteria/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skills.test.mjs`
Expected: FAIL — `ENOENT` reading the `skills` directory.

- [ ] **Step 3: Write minimal implementation**

Create `skills/devpost-recon/SKILL.md`:

```markdown
---
name: devpost-recon
description: Use when reading a Devpost hackathon page to extract rules, criteria, deadlines and requirements — covers page anatomy, where requirements actually hide, and what to quote verbatim.
---

# Reading a Devpost hackathon

The rules page is not where most of the decisive information lives.

## Page anatomy

| Page | What only it has |
|---|---|
| `/` | Prizes and tracks with cash values, the judging panel, participant count, the criteria in summary |
| `/rules` | Dates with timezones, eligibility exclusions, submission requirements, tie-breaking, bonus mechanics, IP terms |
| `/resources` | Sponsor and partner sections, and the FAQ |
| `/updates` | Host clarifications posted after launch — **these outrank the original rules text** |
| `/project-gallery` | Nothing, during a live hackathon. See below. |

## The two places requirements hide

**Partner and sponsor sections on `/resources`.** These read like documentation and
function like requirements. A sponsor listing the exact span attributes their dashboard
expects has just told you what a judge will check for. Extract them with a verbatim quote —
a finding that can be traced to the host's own words is the one that survives an argument.

**The FAQ.** Hosts routinely put rubric language there that never appears on the rules
page: what will score poorly, what a diagram should contain, how AI-assisted code will be
treated. Capture it in `host_guidance` verbatim.

## The gallery is empty and that is not a bug

Devpost project galleries populate only **until winners are announced**. During the
submission period you cannot see how many people entered a track, so per-track crowding is
unobservable. Record `gallery_available: false`, leave `entries_observed` null, and do not
substitute the participant count — that counts registrations, most of which never submit.

If the hackathon is one edition of a recurring series, the *prior* edition's gallery is
populated and is the single richest page available to you: winners, their pitches, and
often the one-line technology thesis each used.

## Dates are not one date

Separate three kinds:

- **`hard`** — the submission deadline. Exactly one.
- **`action`** — a cut-off with its own earlier date that costs a resource if missed:
  credit request forms, registration windows, credit expiry. These are missed constantly
  because everyone is watching the big number.
- **`informational`** — judging period, winner announcement.

Every one gets an **explicit UTC offset**. Prose like "June 29, 2026 (5:00 pm Pacific
Time)" becomes `2026-06-29T17:00:00-07:00`. Watch the date line: a deadline displayed as
"Jun 30 @ 2:00am GMT+2" is the same instant as "Jun 29 5:00pm PT."

## Extract verbatim, summarise never

Quote, don't paraphrase, for: every judging criterion, every hard submission requirement,
the Stage-One language, the tie-breaking rule, the bonus mechanics, and the eligibility
exclusions. Everything else may be summarised.

## Ambiguities are actionable

Rules contain copy-paste errors — a prize table that lists the B2B second-place prize as
open to B2C entries, for example. When you find one, record the passage, the likely
reading, and the remedy: most Devpost rules explicitly invite a written request for
clarification before the deadline. Flagging it is worth more than silently assuming.

## Never guess

Anything you cannot determine goes into `unresolved` as a plain sentence. Recon completes
with open questions; it does not complete with invented answers.
```

Create `skills/judging-criteria-scoring/SKILL.md`:

```markdown
---
name: judging-criteria-scoring
description: Use when turning hackathon judging criteria into a scoring rubric, or when choosing which track to enter — covers Stage-One gating, tiebreak order, bonus headroom and expected value.
---

# Scoring against the real rubric

## Stage One is a gate, not a criterion

Most hackathons screen on pass/fail before anything is scored: does the project fit the
theme, and does it genuinely apply the required technology? This is where submissions die
cheapest — a missing demo video or an unused required API is a disqualification, not a low
score.

Run the gate first, and **do not score what fails it**. A number on a non-compliant idea
makes it harder to abandon, which is the opposite of what the gate is for.

## "Equally weighted" does not mean equally valuable

When the rules say ties break by "the first applicable criterion listed above, then the
next," the ordering carries weight the percentages do not show. The top-ranked criterion
decides every close call. Record the rank, and when it changes a ranking, say so.

## The score ceiling is often not 5

Bonus contributions are usually worth a fixed increment per published piece up to a cap —
0.2 each to a maximum of 0.6 is common, which makes the real ceiling 5.6, not 5. That is
roughly eleven percent of the maximum available for a few hours of writing, and most
entrants skip it entirely. Treat it as score, not as marketing.

The mechanics matter: the piece must be genuinely public (not unlisted), must carry the
host's required disclosure language verbatim, and usually must use a specific hashtag.
Missing any of those forfeits the points.

## Choosing a track is an expected-value problem

Each track is a separate competition pool, usually with identical prizes. When a project
may win only one prize, entering the less crowded pool for the same money is free expected
value.

The problem is that **you usually cannot measure crowding.** Devpost galleries are empty
until winners are announced. So:

1. Use prize structure and track count — real, known numbers.
2. Use prior editions of a recurring series, whose galleries are populated.
3. Where neither is available, say the crowding is unknown. An honest "we chose on fit, not
   on measured field size" is worth more than a fabricated estimate.

Open "Best Of" prizes are a separate consideration: usually open to every submission
regardless of track, so they are a second shot that costs nothing extra — but if only one
prize per project is allowed, they are an alternative outcome, not an addition.

## Scoring honestly

Score against the criterion's **quoted text**, not its name. "Design" means whatever the
host said it means, and hosts often mean something specific — "does the front-end feel
designed in relation to the back-end" is a full-stack coherence test, not a visual one.

Spread your scores. If everything scores 4, the ranking carries no information and you have
done nothing except add numbers to a list.

## Read the panel

Who the judges are tells you what the submission must lead with. A panel of ten database
product managers will read a data-model argument closely and skim the brand story. The same
project, same rubric, different emphasis — and emphasis is free.
```

Create `skills/project-description/SKILL.md`:

```markdown
---
name: project-description
description: Use when writing the project description for a hackathon entry — the section spine that survives implementation, named characters as load-bearing, and mapping headings to judging criteria.
---

# Writing a project description that survives implementation

A description written once and used everywhere beats four documents that disagree. The
shape below is the one that held up from ideation through submission.

## The section spine

1. **TL;DR** — the elevator pitch in a paragraph.
2. **The problem, and why now** — real stakes, a named audience, and what changed recently.
   "Why now" is what separates a product from a project.
3. **The insight** — framed as two extremes and the underserved middle between them.
   Clinical software is built for institutions; generic organisers have no concept of the
   domain; the middle is unclaimed. This framing does more work than any feature list.
4. **Personas** — a table. Who they are, what they need.
5. **What it does** — features grouped by pillar, never a flat list.
6. **A day in the life** — a narrative with named characters.
7. **Product principles** — the design philosophy that makes it unmistakably for this
   audience rather than a generic dashboard.
8. **Limitations and out of scope** — mandatory.

## Named characters are load-bearing

The names you invent in "a day in the life" are not decoration. In the entry that won, the
same four people became the **seeded demo data**, the **demo video script**, and the
**submission narrative**. One decision, three deliverables, and a judge who reads the
description then opens the demo sees the same family.

So: name them once, deliberately, with a plausible geography that carries the point of the
product. Then reuse those exact names in every later phase.

## Quantify

Every winning submission in the reference corpus puts a number in the pitch. Market size,
latency, a count of the thing you built, a population figure. "2.1 billion people will be
60+ by 2050." "74 RLS policies across 33 tables." "Under 50ms at zero marginal cost." A
number is the cheapest credibility available.

## Limitations are the "What's next" section

Write them honestly and early. At submission time they become the roadmap, and a roadmap
that reads as considered rather than improvised signals that you knew what you were
choosing not to build.

## Headings map to criteria

The submission's headings are not neutral. The Devpost defaults — Inspiration, What it
does, How we built it, Challenges, Accomplishments, What we learned, What's next — are a
floor, and winners insert headings for the criteria they intend to win.

Plan **at least one heading per judging criterion**, and put the technology thesis at the
top level rather than buried inside "How we built it." In the reference corpus that
placement is what separates the track winners from the category prizes: the same argument,
promoted, read by more judges.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/skills.test.mjs`
Expected: PASS, 11 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add skills/ tests/skills.test.mjs
git commit -m "feat: add the devpost-recon, judging-criteria-scoring and project-description skills"
```

---

### Task 11: The evidence-bearing skills — ideation and the technology thesis

**Files:**
- Create: `skills/winning-ideation/SKILL.md`
- Create: `skills/winning-ideation/references/winner-corpus.md`
- Create: `skills/sponsor-tech-thesis/SKILL.md`
- Test: `tests/skills.test.mjs` (extend)

**Interfaces:**
- Consumes: `tests/skills.test.mjs` from Task 10.
- Produces: two more skill directories and the corpus reference file. `winning-ideation` is the skill `idea-generator` and `idea-scorer` load; `sponsor-tech-thesis` is loaded at four phases across the whole workflow.

- [ ] **Step 1: Write the failing test**

Append to `tests/skills.test.mjs`:

```js
test('the evidence-bearing skills exist', async () => {
  const names = await skillNames();
  for (const n of ['winning-ideation', 'sponsor-tech-thesis']) {
    assert.ok(names.includes(n), `missing skills/${n}`);
  }
});

test('winning-ideation ships the winner corpus as a reference', async () => {
  const p = path.join(skillsDir, 'winning-ideation/references/winner-corpus.md');
  const corpus = await readFile(p, 'utf8');
  assert.ok(corpus.length > 2000, 'the corpus should carry real evidence, not a stub');
});

test('the corpus names every project it claims to cover', async () => {
  const corpus = await readFile(
    path.join(skillsDir, 'winning-ideation/references/winner-corpus.md'), 'utf8',
  );
  for (const name of [
    'Waylo', 'Sammy', 'Sonar', 'HYPE', 'Relay', 'Kintwadi',
    'Cassandra', 'CrisisRoute', 'Karma',
    'BackstageCommercials', 'Title AI', 'Project Memoria',
  ]) {
    assert.ok(corpus.includes(name), `corpus is missing ${name}`);
  }
});

test('the corpus records the prize each project won', async () => {
  const corpus = await readFile(
    path.join(skillsDir, 'winning-ideation/references/winner-corpus.md'), 'utf8',
  );
  assert.match(corpus, /Best Design/);
  assert.match(corpus, /Best Technical Implementation/);
  assert.match(corpus, /First Place/i);
});

test('winning-ideation points at the corpus rather than restating it', async () => {
  const content = await readSkill('winning-ideation');
  assert.match(content, /winner-corpus\.md/);
});

test('winning-ideation carries the inversion test and the anti-patterns', async () => {
  const content = await readSkill('winning-ideation');
  assert.match(content, /inversion/i);
  assert.match(content, /todo app/i);
  assert.match(content, /wrapper/i);
});

test('winning-ideation carries the demoability and quantification tests', async () => {
  const content = await readSkill('winning-ideation');
  assert.match(content, /three minutes|3 minutes|demo moment/i);
  assert.match(content, /number|quantif/i);
});

test('sponsor-tech-thesis states the placement rule with its evidence', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  assert.match(content, /top-level heading/i);
  // The finding this skill exists for: same argument, different placement, different prize.
  assert.match(content, /Kintwadi/);
  assert.match(content, /Relay|HYPE|Sonar/);
});

test('sponsor-tech-thesis names the four phases that load it', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  for (const phase of ['brainstorm', 'describe', 'architect', 'submit']) {
    assert.ok(content.includes(phase), `should say how :${phase} uses the thesis`);
  }
});

test('sponsor-tech-thesis warns about a thesis the architecture cannot support', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  assert.match(content, /cannot support|does not support|unsupported|cash the cheque|earn it/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skills.test.mjs`
Expected: FAIL — `skills/winning-ideation` and `skills/sponsor-tech-thesis` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `skills/winning-ideation/references/winner-corpus.md`:

```markdown
# Winner corpus

Twelve winning Devpost submissions across three hackathons, read in full. Six come from a
single hackathon, which is what makes the placement differences readable.

## H0: Hack the Zero Stack (AWS Databases + Vercel)

| Project | Prize | Pitch | Thesis | Inversion |
|---|---|---|---|---|
| **Waylo** | First Place — Monetizable B2C | An AI that lives on your Mac and guides you through anything; a pulsing red dot shows where to click next | Four progressively cheaper detection layers — accessibility tree, OCR, dual YOLO, then Bedrock — so most steps resolve "in under 50ms at zero marginal cost" | Vision is the last resort, not the first tool |
| **Sammy** | First Place — Monetizable B2B | HIPAA blocks pooling patient data; predicts readmission risk with federated learning, running XGBoost inside the database | Aurora is "the secure core, not a passive store" — the trained model is stored as bytes inside the database, and "nothing ever leaves that private network boundary" | The model goes to the data, not the data to the model |
| **Sonar** | First Place — Million-scale Global | A live radar of what's happening around you — ephemeral, crowd-curated, conversational | "DynamoDB for speed, Aurora DSQL for record" — ephemeral geo-writes and durable state split by access pattern | The database is chosen by the access pattern, not the data model |
| **HYPE** | Best Technical Implementation | "Play money. Real database guarantees. Internet culture finally has a market." | Aurora DSQL as "the trust layer behind a live, auditable, proof-of-solvency market" | Play money, real settlement guarantees |
| **Relay** | Most Impactful | Standby access for the people who will need it | Aurora DSQL for multi-region active-active availability, strong consistency on irreversible actions, and optimistic concurrency on low-contention vaults | Continuity planning for *living* emergencies, not only death |
| **Kintwadi** | Best Design | One shared, permission-aware care record for families caring for an aging parent across cities and time zones | "The database is the thesis, not a default" — caregiving is relational, transactional and access-controlled | Authorization lives in the database, not the UI |

### The placement finding

Kintwadi's thesis is as strong as any in the table. It is buried inside "How we built it."
It won a $2,000 category prize.

Relay put "Which AWS Database — and why Aurora DSQL" at **section three**, ahead of "How we
built it." HYPE gave the argument two top-level headings, "Why Aurora DSQL Matters" and
"DSQL-Aware Engineering Decisions." Sonar renamed a default heading around it: "How we
built it — the data model is the product." All three won $10,000.

Same rubric, same panel, same class of argument. Different placement.

### Heading structure

HYPE won Best Technical Implementation with headings that restate the criteria:
Inspiration · What HYPE Does · Core Product Surfaces · How We Built It · Architecture ·
The Math: Proof of Solvency · Why Aurora DSQL Matters · DSQL-Aware Engineering Decisions ·
Monetization Model · Path to a $100M-Scale Opportunity · Impact · Challenges · What We
Learned · What Makes HYPE Original · What's Next.

Relay named its **track** in a heading: "Business model (Monetizable B2C)."

## Google Cloud Rapid Agent Hackathon

| Project | Prize | Pitch | Inversion |
|---|---|---|---|
| **Cassandra** | First Place — Arize | "AI agents fail silently, confidently wrong, and nobody notices. Cassandra is an AI that watches your AIs." | An AI supervisor for AIs |
| **CrisisRoute** | First Place — Elastic | "Right Patient, Right Hospital, Right Time" — multi-agent emergency hospital routing | Routing on clinical capability, not geographic proximity |
| **Karma** | Second Place — Dynatrace | Learns a deprecated service's hidden contracts and haunts its replacement | "Tests check the contract you wrote down. Karma checks the contract you forgot you had." |

## Amazon Nova AI Hackathon

| Project | Prize | Pitch | Inversion |
|---|---|---|---|
| **BackstageCommercials** | First Prize Overall | AI-integrated ads seamlessly embedded into the background | Product placement instead of interruption |
| **Title AI** | Best of UI Automation | Autonomously searches any US county recorder website and produces a complete title commitment report | "County recorder websites are the last mile of real estate data, and the only way through is a browser controlled by an AI that can reason about unfamiliar interfaces." |
| **Project Memoria** | Best of Multimodal Understanding | Helps dementia patients recall conversations and find lost objects | Retrieval quality beats model capability |

## What generalises

**Every winner has a technology thesis.** Six of six in H0. Not "we used X" but a reason a
competitor using something else could not claim.

**Every winner can be stated as an inversion.** See the tables — the form is consistent
enough to generate against.

**Everyone quantifies.** "$3.6 trillion real estate industry" (Title AI). "Path to a
$100M-Scale Opportunity" (HYPE). "Under 50ms at zero marginal cost" (Waylo). "74 RLS
policies across 33 tables" (Kintwadi).

**No winner is a thin wrapper.** In-database federated XGBoost. A dual-database
access-pattern split. An optimistic-concurrency ledger with a public solvency proof. A
four-layer detection cascade. Multi-agent contract inference over live telemetry.

**A no-account demo is a strong lever, not a gate.** Only Kintwadi, Sammy and CrisisRoute
advertise one. Project Memoria and BackstageCommercials shipped **no live demo at all** —
GitHub only — and still won. Combined with the common rule that "judges are not required to
test the Project and may choose to judge based solely on the text description, images, and
video," the written submission carries more weight than the demo.

**Challenges sections are specific and technical.** "A stray `{service_id}` in a prompt
raised a `KeyError`" (Karma). "Coordinate system mismatches across macOS" (Waylo).
"Couldn't use raw MIMIC-IV in a public demo" (Sammy). Nobody writes "time management was
hard."
```

Create `skills/winning-ideation/SKILL.md`:

```markdown
---
name: winning-ideation
description: Use when generating or evaluating hackathon project ideas — the angles that win, the anti-patterns that lose, and the inversion, demoability and quantification tests.
---

# Generating ideas that can actually place first

The evidence base for everything here is `references/winner-corpus.md` — twelve winning
submissions across three hackathons, six of them from a single hackathon so the placement
differences are readable. Read it when calibrating; don't rely on recall.

## Four angles, run in parallel

One agent producing ten ideas converges on a house style. Four agents with different
angles diverge, which is the point.

- **technical-wow** — the demo that makes a judge lean forward, with a hard engineering
  spine underneath.
- **social-impact** — a real, nameable beneficiary and stakes that matter.
- **sponsor-native** — impossible without the required technology, not merely using it.
- **underserved-niche** — a specific audience nobody builds for.

## The three tests

**The inversion test.** Every winner in the corpus can be stated as "X, not Y" in one
sentence: the model goes to the data, not the data to the model; authorization lives in the
database, not the UI; vision is the last resort, not the first tool. If you cannot write
that sentence, the idea is not finished. This is the Originality criterion made mechanical.

**The thesis test.** One line on why *this* required technology, phrased so a competitor
using a different technology could not claim it. See `sponsor-tech-thesis`.

**The demoability test.** Name the single visceral thing a judge sees inside three minutes.
Kintwadi's is an aide's view blocked from a financial document, captioned "blocked by the
database, not the UI." If the demo moment is "a dashboard loads," there isn't one.

## Quantify

Every winning pitch in the corpus carries a number — market size, latency, a count of the
thing built, a population figure. It is the cheapest credibility available, and its absence
is conspicuous.

## Anti-patterns

Todo apps. Thin chatbot wrappers over documents. "X, but with AI." Anything whose whole
description is a prompt plus a UI. Ideas in categories with ten funded companies where you
add nothing. Note what the corpus contains instead: in-database federated learning, a
dual-database access-pattern split, an optimistic-concurrency ledger with a public solvency
proof. There is always a hard spine.

## Scope to the hours you actually have

An idea that cannot reach a working vertical slice is worth less than a narrower one that
can. Estimate hours per idea and treat a number well past the budget as a scoring input,
not a detail — the corpus rewards depth in one direction over breadth in six.

## Generation and scoring are separate jobs

Generate without scoring. Score in a fresh context, by an agent that did not generate. A
generator rating its own ideas rates enthusiasm.
```

Create `skills/sponsor-tech-thesis/SKILL.md`:

```markdown
---
name: sponsor-tech-thesis
description: Use when deciding or writing the one-line justification for a hackathon's required technology — the form it takes, where to place it in a submission, and how to avoid claiming more than the architecture supports.
---

# The technology thesis

One sentence saying why *this* technology, phrased so that a competitor using a different
technology could not claim it.

"We used Aurora PostgreSQL" is not a thesis; it is a fact. "Caregiving is relational,
transactional and access-controlled, so authorization belongs in the database — a key-value
store cannot enforce it" is a thesis: it names a property of the domain, connects it to a
property of the engine, and excludes the alternative.

## The form

Every winner in `../winning-ideation/references/winner-corpus.md` has one, and they share a
shape — an inversion that names the excluded alternative:

- Sammy: the model is stored inside Aurora and inference runs in the VPC, so "nothing ever
  leaves that private network boundary" — the model goes to the data, not the data to the model.
- Sonar: "DynamoDB for speed, Aurora DSQL for record" — the database is chosen by the access
  pattern, not the data model.
- Waylo: four cheaper detection layers first, so "Nova only fires as a genuine last resort."
- Relay: Aurora DSQL for multi-region active-active writes and strong consistency on
  irreversible actions.

Write it as: **[property of the domain] → [property of this engine] → [what the alternative
cannot do].**

## Placement decides how many judges read it

This is the finding the skill exists for.

Kintwadi's thesis — "the database is the thesis, not a default" — is as strong as any in the
corpus. It sits inside "How we built it," several screens down. It won Best Design, $2,000.

Relay put "Which AWS Database — and why Aurora DSQL" at **section three**, ahead of "How we
built it." HYPE gave the argument two top-level headings. Sonar renamed a default heading
around it: "How we built it — the data model is the product." Each won a $10,000 track
first place.

**Promote the thesis to a top-level heading, high in the document.** Same argument, more
readers, different prize.

## Where it is used

- **`:brainstorm`** — every candidate is scored on whether a thesis can be written for it at
  all. An idea with no thesis will not survive the Stage-One "reasonably applies the required
  APIs" gate either.
- **`:describe`** — the thesis is written into `strategy.md` and the heading plan promotes it.
- **`:architect`** — the architecture must actually earn it. This is the phase where the
  claim becomes a constraint.
- **`:submit`** — the README and the Devpost description lead with it, and the demo video
  says it out loud.

## The failure mode

A thesis the architecture does not support is worse than none, because judges on a sponsor
panel are hired to notice exactly this. If the submission claims the database enforces
authorization, there must be policies in the schema and a test proving cross-tenant
isolation. If it claims a cheaper path runs first, there must be measurements.

Write the thesis at `:describe`, then treat it as a bill the build has to pay. If by
`:review` the architecture cannot cash it, change the thesis to what is true — a smaller
honest claim scores better than a large one a judge can puncture in thirty seconds.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/skills.test.mjs`
Expected: PASS, 21 tests. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add skills/winning-ideation skills/sponsor-tech-thesis tests/skills.test.mjs
git commit -m "feat: add winning-ideation with the winner corpus, and the sponsor-tech-thesis skill"
```

---

### Task 12: Command definitions

**Files:**
- Create: `commands/recon.md`
- Create: `commands/brainstorm.md`
- Create: `commands/describe.md`
- Test: `tests/commands.test.mjs` (extend)

**Interfaces:**
- Consumes: every script and agent from Tasks 4, 6, 7, 9, and the skills from Tasks 10–11.
- Produces: the three user-facing commands. This is the task that makes M2 usable.

- [ ] **Step 1: Write the failing test**

Append to `tests/commands.test.mjs`:

```js
test('the three M2 commands exist', async () => {
  const files = await commandFiles();
  for (const f of ['recon.md', 'brainstorm.md', 'describe.md']) {
    assert.ok(files.includes(f), `missing commands/${f}`);
  }
});

test('recon states the retry bound so a failing agent cannot loop forever', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  // recon.mjs validate exits non-zero with a full error list; the command must say how
  // many times to feed that list back before giving up.
  assert.match(content, /twice|two attempts|at most 2/i);
});

test('recon states the never-guess rule and recites unresolved items at the gate', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  assert.match(content, /never guess|do not guess/i);
  assert.match(content, /unresolved/);
  assert.match(content, /ambiguit/i);
});

test('recon does not promise gallery-derived crowding numbers', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  // Regression: an earlier draft of the design had :recon reading per-track crowding from
  // /project-gallery. Devpost galleries are empty until winners are announced, so during a
  // live hackathon that number does not exist and must never be implied.
  assert.match(content, /until winners are announced|empty/i);
});

test('brainstorm encodes gate-before-score', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  assert.match(content, /Stage One/i);
  assert.match(content, /before/i);
  assert.match(content, /disqualified/);
});

test('brainstorm dispatches four generators in parallel and one scorer separately', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  assert.match(content, /parallel/i);
  assert.match(content, /idea-generator/);
  assert.match(content, /idea-scorer/);
  assert.match(content, /fresh context/i);
});

test('brainstorm archives before a fresh round rather than overwriting', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  assert.match(content, /--fresh/);
  assert.match(content, /archive/);
});

test('describe names both output files', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /project\.md/);
  assert.match(content, /strategy\.md/);
});

test('describe requires an explicit track choice', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /--track/);
  assert.match(content, /one prize|single bet|one track/i);
});

test('describe tells the user to read the thesis aloud at the gate', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /thesis/);
});

test('every M2 command ends at an approval gate rather than advancing', async () => {
  for (const f of ['recon.md', 'brainstorm.md', 'describe.md']) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    assert.match(content, /awaiting_approval/, `${f} must set the phase to awaiting_approval`);
    assert.match(content, /stop|do not (continue|advance|proceed)/i, `${f} must stop at the gate`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/commands.test.mjs`
Expected: FAIL — `commands/recon.md` and the other two do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `commands/recon.md`:

```markdown
---
description: Read a Devpost hackathon end to end — rules, rubric, deadlines, panel, bonus points — and write the brief
argument-hint: "<devpost-url>"
allowed-tools: Bash, Read, Write, Task
---

Ingest the hackathon at `$ARGUMENTS`.

Load the `devpost-recon` and `judging-criteria-scoring` skills before starting.

## Step 1 — Dispatch the recon agent

Dispatch the `hackathon-recon` agent with the URL. It fetches `/`, `/rules`, `/resources`,
`/updates` and `/project-gallery`, and writes `.hackathon/recon.json`.

Do not fetch the pages yourself. Raw Devpost markup is enormous and must not enter this
conversation — that is the entire reason the agent exists.

**On the gallery:** Devpost project galleries stay empty until winners are announced, so
per-track crowding is not observable during a live hackathon. If the agent reports a
crowding number for a live hackathon, that number is invented — reject it. For a recurring
series the agent reads the *prior* edition's gallery instead, which is populated.

## Step 2 — Validate, and feed failures back

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/recon.mjs validate .hackathon/recon.json`

On failure the script prints every problem at once. Send that whole list back to the agent
and let it fix the payload. **Do this at most twice.** If it still fails, stop and show the
user the errors — a third attempt is a loop, not a fix.

Never hand-edit the payload to make validation pass. If a field cannot be determined, it
belongs in `unresolved`, not filled in with a plausible guess.

## Step 3 — Apply

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/recon.mjs apply "$PWD"`

This writes `brief.md`, `rules.md` and `criteria.md`, populates `state.json.hackathon`,
seeds the submission-requirement deliverables, and sets the phase to `awaiting_approval`.

## Step 4 — Ask about the budget

Ask how many hours are realistically available between now and the deadline, and write it
to `budget.total_hours` in `.hackathon/state.json`. This is what later phases use to decide
whether a scope is achievable.

## Step 5 — Present, then stop

Show the user, in this order:

1. **The rubric** — every criterion, and which one breaks ties. If ties break on listed
   order, say plainly that equal weighting does not mean equal value.
2. **The deadlines** — the submission deadline, and separately every dated action that
   closes earlier. Credit request forms are missed constantly because everyone watches the
   big number.
3. **Required technology** — non-negotiable, and what it excludes.
4. **The panel read** — who the judges are and what that means for what to lead with.
5. **Bonus points** — the real score ceiling, and what claiming them requires.
6. **Ambiguities and unresolved items** — recite these explicitly. Never bury them. An
   ambiguity in the rules usually comes with a remedy the rules themselves provide.
7. **Eligibility exclusions** — check these against the user's own situation before they
   spend an hour building.

Then ask for approval and **stop**. Do not start the next phase. The phase is
`awaiting_approval` and `:next` will refuse to advance until the user decides.
```

Create `commands/brainstorm.md`:

```markdown
---
description: Generate ten project ideas from four angles, gate them on Stage One, and score the survivors against the real rubric
argument-hint: "[--fresh] [--angle <name>]"
allowed-tools: Bash, Read, Write, Task
---

Generate and rank ideas for this hackathon.

Load the `winning-ideation` and `sponsor-tech-thesis` skills before starting, and read
`skills/winning-ideation/references/winner-corpus.md` for calibration.

Requires an approved `:recon` — the rubric in `.hackathon/recon.json` is what everything is
scored against.

## Step 1 — Handle `--fresh`

If `--fresh` was passed, run:

`node ${CLAUDE_PLUGIN_ROOT}/scripts/brainstorm.mjs archive "$PWD"`

This preserves the current round as `ideas-round-N.md` / `.json`. Nothing is overwritten and
nothing is lost. Then generate with **no knowledge of the previous round** — that is the
whole point of a fresh round, and re-reading the old one defeats it.

## Step 2 — Generate, four agents in parallel

Dispatch four `idea-generator` agents **in parallel**, one per angle:

- `technical-wow` — the demo that makes a judge lean forward
- `social-impact` — a real, nameable beneficiary
- `sponsor-native` — impossible without the required technology, not merely using it
- `underserved-niche` — a specific audience nobody builds for

If `--angle <name>` was passed, dispatch only that one.

Each returns candidates with a thesis, an inversion, and a demo moment. **Generators do not
score.**

## Step 3 — Score, in a fresh context

Dispatch one `idea-scorer` agent with all the candidates. It runs in a fresh context on
purpose: a generator scoring its own ideas rates enthusiasm rather than fit.

The order it works in is the point:

1. **The Stage-One gate first.** Theme fit and genuine use of required technology. Failures
   go to `disqualified` with reasons and **no scores** — a number on a non-compliant idea
   only makes it harder to let go of.
2. The inversion test, the thesis test, the demo moment.
3. Only then, per-criterion scoring, with ties broken by the rubric's rank order.

The agent writes `.hackathon/ideas.json` and validates it. Feed validation failures back at
most twice.

## Step 4 — Apply

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/brainstorm.mjs apply "$PWD"`

This renders `ideas.md` and sets the phase to `awaiting_approval`.

## Step 5 — Present, then stop

Show the shortlist, then go deeper on the top three: what each wins on, what it risks, and
the hour estimate against the remaining budget. Show the disqualified ideas too, with their
reasons — knowing why something was ruled out is worth as much as the ranking.

If every idea was disqualified, say so plainly and offer another round. That is a real
result, not a failed run.

Then ask the user to pick one idea, or request another round with `--fresh`. **Stop there.**
Do not start `:describe`.
```

Create `commands/describe.md`:

```markdown
---
description: Turn the chosen idea into the product case and the win strategy — project.md and strategy.md
argument-hint: "[--idea <id>] [--track <track-id>]"
allowed-tools: Bash, Read, Write, Edit
---

Write up the selected idea.

Load the `project-description` and `sponsor-tech-thesis` skills before starting.

Requires an approved `:brainstorm`. If no `--idea` was passed, read `.hackathon/ideas.json`
and ask which one — never assume the top-ranked idea was the one chosen.

## Step 1 — Settle the track

A project may usually enter only **one** track, so this is a single bet rather than a hedge.
Show the tracks with their prizes and the idea's `ev_note`, and ask.

Be honest about what you don't know: during a live hackathon the project gallery is empty,
so per-track crowding is unobservable. Choose on prize structure and fit, and say that is
what you are doing.

## Step 2 — Scaffold

Run: `node ${CLAUDE_PLUGIN_ROOT}/scripts/describe.mjs apply "$PWD" --idea <id> --track <track-id>`

This writes `.hackathon/project.md` (an outline) and `.hackathon/strategy.md` (the criteria
map, heading plan, demo skeleton and bonus plan, rendered from the rubric), seeds the
bonus-content deliverables, and sets the phase to `awaiting_approval`.

## Step 3 — Write the prose

Fill in `project.md` against its section spine. Two things carry more weight than they look:

**"Why now."** What changed recently that makes this the moment. It is what separates a
product from a project.

**The named characters in "a day in the life."** These are load-bearing. In the entry that
won, the same four people became the seeded demo data, the demo video script, and the
submission narrative — one decision, three deliverables. Name them deliberately, give them a
geography that carries the point of the product, and expect every later phase to reuse those
exact names.

Then complete `strategy.md`: fill the "how it wins" column of the criteria map, choose the
angle and platform for each bonus slot, and write the risks table. Do not edit the criteria
rows themselves — they are rendered from the rubric so they cannot drift from `criteria.md`.

## Step 4 — Present, then stop

**Read the thesis aloud first.** One sentence on why this technology, that a competitor
using something else could not claim. Everything downstream depends on it: `:architect` has
to earn it, `:submit` leads with it. If it doesn't survive being said out loud, fix it now
rather than after the architecture is built around it.

Then walk through the criteria map, the heading plan — noting which headings are insertions
beyond the Devpost defaults and why the thesis is promoted to a top-level heading — the demo
moment, and the bonus plan.

Ask for approval and **stop**. Do not proceed to `:stack`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/commands.test.mjs`
Expected: PASS — the M1 tests plus 11 new ones. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add commands/recon.md commands/brainstorm.md commands/describe.md tests/commands.test.mjs
git commit -m "feat: add the recon, brainstorm and describe command definitions"
```

---

## Milestone verification

After Task 12, verify M2 end to end rather than trusting the unit tests alone.

- [ ] **Full suite:** `npm test` — every suite green, no skipped tests.
- [ ] **Migration from a real M1 project:** take a directory initialized by M1 (schema v1),
      run `node scripts/recon.mjs apply .` against the golden fixture, and confirm the state
      migrates to v2 without losing any phase status or budget value.
- [ ] **Validator rejects reality's worst case:** hand-edit a copy of `tests/fixtures/h0-recon.json`
      to use `"at": "2026-06-29T17:00:00"` and confirm `recon.mjs validate` exits 1 naming the
      offset. This is the single most expensive bug the schema prevents.
- [ ] **Gate before scoring holds:** hand-edit `tests/fixtures/h0-ideas.json` to give a
      disqualified idea a score and confirm `brainstorm.mjs validate` refuses it.
- [ ] **Round preservation:** run `brainstorm.mjs apply`, then `archive`, then `apply` again,
      and confirm `ideas-round-1.*` still exists untouched alongside a new `ideas.md`.
- [ ] **Hook budget:** with recon applied and a project name set, run `node hooks/inject-state.mjs`
      from the project root and confirm ≤40 lines that name the next phase, the submission
      deadline, the next action deadline, and the tiebreak criterion.
- [ ] **Status board:** run `node scripts/status.mjs .` and confirm it shows outstanding
      deliverables and the unclaimed bonus points without nagging about finished items.
- [ ] **Drift coverage comes free:** delete `.hackathon/criteria.md` after approving recon and
      confirm `node scripts/next.mjs .` reports drift naming that file. Nothing in Task 4 wired
      this up — `resolve-next.mjs` already walks `phase.artifacts`.
- [ ] **Live run against a real hackathon:** run `/win-hackathon:recon <url>` against an
      archived Devpost hackathon and read `brief.md`, `rules.md` and `criteria.md` as a human
      would. The test that matters: does the brief tell you something you would have missed
      reading the pages yourself?
- [ ] **Install for real:** add the local repo as a marketplace, install the plugin, and confirm
      `/win-hackathon:recon`, `:brainstorm` and `:describe` appear alongside the M1 commands.

M2's acceptance test is the live run. The unit tests prove the contracts hold; only reading
a real brief proves the extraction is worth having.

</content>
