import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOOLS, checkTools } from '../../scripts/lib/preflight.mjs';

test('node is detected as present with a version', async () => {
  const results = await checkTools([
    { name: 'node', cmd: 'node', args: ['--version'], needate: 'everything', blocking: true },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].present, true);
  assert.match(results[0].version, /^v?\d+\./);
});

test('a nonexistent tool is reported absent rather than throwing', async () => {
  const results = await checkTools([
    {
      name: 'definitely-not-installed-xyz', cmd: 'definitely-not-installed-xyz',
      args: ['--version'], needate: 'nothing', blocking: false,
    },
  ]);
  assert.equal(results[0].present, false);
  assert.equal(results[0].version, null);
});

test('DEFAULT_TOOLS covers the tools named in the spec preflight table', () => {
  const names = DEFAULT_TOOLS.map((t) => t.name);
  for (const expected of ['git', 'node', 'python3', 'docker', 'gh']) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

test('every default tool declares needate and blocking', () => {
  for (const t of DEFAULT_TOOLS) {
    assert.equal(typeof t.needate, 'string', `${t.name} needate`);
    assert.equal(typeof t.blocking, 'boolean', `${t.name} blocking`);
  }
});

test('checkTools runs the whole list even when some are missing', async () => {
  const results = await checkTools([
    { name: 'nope-a', cmd: 'nope-a', args: [], needate: 'x', blocking: false },
    { name: 'node', cmd: 'node', args: ['--version'], needate: 'y', blocking: true },
    { name: 'nope-b', cmd: 'nope-b', args: [], needate: 'z', blocking: false },
  ]);
  assert.deepEqual(results.map((r) => r.present), [false, true, false]);
});
