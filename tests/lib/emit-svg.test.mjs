import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout } from '../../scripts/lib/layout.mjs';
import { emitSvg } from '../../scripts/lib/emit-svg.mjs';

const golden = async () =>
  JSON.parse(await readFile(new URL('../fixtures/h0-architecture.json', import.meta.url), 'utf8'));

test('it is a complete standalone SVG document', async () => {
  const arch = await golden();
  const svg = emitSvg(arch, layout(arch));
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

test('it references no external resource', async () => {
  const arch = await golden();
  const svg = emitSvg(arch, layout(arch));
  assert.ok(!/https?:\/\//.test(svg.replace(/xmlns[^"]*"[^"]*"/g, '')),
    'the only URLs allowed are the SVG namespace declarations');
  assert.ok(!/<script/i.test(svg));
  assert.ok(!/@import|<image/i.test(svg));
});

test('the viewBox matches the computed canvas', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const svg = emitSvg(arch, laid);
  assert.ok(svg.includes(`viewBox="0 0 ${laid.canvas.width} ${laid.canvas.height}"`));
});

test('every component is drawn as a rect at its laid-out position', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const svg = emitSvg(arch, laid);
  for (const b of laid.boxes) {
    assert.ok(svg.includes(`x="${b.x}" y="${b.y}"`), `no rect at ${b.id}'s position`);
    assert.ok(svg.includes(b.label), `label for ${b.id} is missing`);
  }
  assert.equal((svg.match(/<rect[^>]*class="box"/g) ?? []).length, laid.boxes.length);
});

test('every edge is drawn exactly once, with an arrowhead', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const svg = emitSvg(arch, laid);
  assert.equal((svg.match(/<line[^>]*class="edge"/g) ?? []).length, laid.edges.length);
  assert.ok(svg.includes('<marker'), 'edges need an arrowhead marker definition');
  assert.ok(svg.includes('marker-end='), 'the marker must actually be applied');
});

test('boundaries are dashed rects drawn behind the boxes', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const svg = emitSvg(arch, laid);
  for (const b of laid.boundaries) {
    assert.ok(svg.includes(`x="${b.x}" y="${b.y}"`), `boundary ${b.id} is not drawn`);
  }
  const firstBoundary = svg.indexOf('class="boundary"');
  const firstBox = svg.indexOf('class="box"');
  assert.ok(firstBoundary !== -1 && firstBoundary < firstBox,
    'boundaries must be painted before boxes or they cover them');
});

test('XML special characters in labels are escaped', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'a', label: 'A & B <tag> "q"', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const svg = emitSvg(arch, layout(arch));
  assert.ok(svg.includes('&amp;'), '& must be escaped or the SVG is malformed');
  assert.ok(svg.includes('&lt;tag&gt;'));
  assert.ok(!/<tag>/.test(svg));
});

test('long labels wrap rather than overflow their box', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'a', label: 'A very long component label that cannot fit on one line',
      tier: 1, trust_zone: 'public', what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const svg = emitSvg(arch, layout(arch));
  assert.ok((svg.match(/<tspan/g) ?? []).length >= 2, 'a long label must be split across tspans');
});

test('a single node with no edges renders without error', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'only', label: 'Only', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const svg = emitSvg(arch, layout(arch));
  assert.ok(svg.includes('Only'));
  assert.equal((svg.match(/<line[^>]*class="edge"/g) ?? []).length, 0);
});
