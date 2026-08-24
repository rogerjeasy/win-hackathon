import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout, LAYOUT } from '../../scripts/lib/layout.mjs';

const golden = async () =>
  JSON.parse(await readFile(new URL('../fixtures/h0-architecture.json', import.meta.url), 'utf8'));

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('every component becomes exactly one box', async () => {
  const arch = await golden();
  const { boxes } = layout(arch);
  assert.equal(boxes.length, arch.components.length);
  assert.deepEqual(boxes.map((b) => b.id).sort(), arch.components.map((c) => c.id).sort());
});

test('no two boxes overlap', async () => {
  const { boxes } = layout(await golden());
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      assert.ok(!overlaps(boxes[i], boxes[j]),
        `${boxes[i].id} overlaps ${boxes[j].id}`);
    }
  }
});

test('tier order is preserved top to bottom', async () => {
  const { boxes } = layout(await golden());
  const byTier = new Map();
  for (const b of boxes) byTier.set(b.tier, Math.min(byTier.get(b.tier) ?? Infinity, b.y));
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(byTier.get(tiers[i]) > byTier.get(tiers[i - 1]),
      `tier ${tiers[i]} must sit below tier ${tiers[i - 1]}`);
  }
});

test('every box lies inside the canvas', async () => {
  const { boxes, canvas } = layout(await golden());
  for (const b of boxes) {
    assert.ok(b.x >= 0 && b.y >= 0, `${b.id} has a negative coordinate`);
    assert.ok(b.x + b.w <= canvas.width, `${b.id} overflows the canvas width`);
    assert.ok(b.y + b.h <= canvas.height, `${b.id} overflows the canvas height`);
  }
});

test('components within a tier are evenly spaced and centred', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [
      { id: 'a', label: 'A', tier: 1, trust_zone: 'public', what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' },
      { id: 'b', label: 'B', tier: 1, trust_zone: 'public', what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' },
      { id: 'c', label: 'C', tier: 2, trust_zone: 'public', what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' },
    ],
  };
  const { boxes, canvas } = layout(arch);
  const [a, b] = boxes.filter((x) => x.tier === 1).sort((p, q) => p.x - q.x);
  assert.equal(b.x - a.x, LAYOUT.BOX_W + LAYOUT.GAP_X);
  const c = boxes.find((x) => x.id === 'c');
  const rowCentre = (a.x + b.x + LAYOUT.BOX_W) / 2;
  assert.equal(c.x + LAYOUT.BOX_W / 2, canvas.width / 2, 'a lone box in its tier is centred');
  assert.equal(rowCentre, canvas.width / 2, 'the widest tier is centred too');
});

test('edges connect bottom-centre to top-centre', async () => {
  const { boxes, edges } = layout(await golden());
  const box = (id) => boxes.find((b) => b.id === id);
  for (const e of edges) {
    const from = box(e.from);
    const to = box(e.to);
    assert.equal(e.x1, from.x + from.w / 2);
    assert.equal(e.y1, from.y + from.h);
    assert.equal(e.x2, to.x + to.w / 2);
    assert.equal(e.y2, to.y);
  }
});

test('every boundary rect encloses all of its members', async () => {
  const arch = await golden();
  const { boxes, boundaries } = layout(arch);
  for (const b of boundaries) {
    const members = arch.trust_boundaries.find((tb) => tb.id === b.id).contains;
    for (const id of members) {
      const box = boxes.find((x) => x.id === id);
      assert.ok(box.x >= b.x && box.y >= b.y
        && box.x + box.w <= b.x + b.w && box.y + box.h <= b.y + b.h,
        `boundary ${b.id} does not enclose ${id}`);
    }
  }
});

test('a single component with no edges lays out without error', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'only', label: 'Only', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const { boxes, edges, boundaries, canvas } = layout(arch);
  assert.equal(boxes.length, 1);
  assert.deepEqual(edges, []);
  assert.deepEqual(boundaries, []);
  assert.ok(canvas.width > 0 && canvas.height > 0);
});

test('layout is deterministic — same input, identical output', async () => {
  const arch = await golden();
  assert.deepEqual(layout(arch), layout(arch));
});

test('layout does not mutate its input', async () => {
  const arch = await golden();
  const before = JSON.stringify(arch);
  layout(arch);
  assert.equal(JSON.stringify(arch), before);
});
