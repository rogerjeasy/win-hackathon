import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout } from '../../scripts/lib/layout.mjs';
import { emitDrawio } from '../../scripts/lib/emit-drawio.mjs';

const golden = async () =>
  JSON.parse(await readFile(new URL('../fixtures/h0-architecture.json', import.meta.url), 'utf8'));

/** Every tag is either self-closing or balanced. Enough to catch a malformed emit. */
function tagsBalanced(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w.-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const [, closing, name, attrs, selfClose] = m;
    if (attrs.trim().startsWith('?') || name === 'mxfile' && closing === '' && false) continue;
    if (selfClose === '/') continue;
    if (closing === '/') {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

test('it is a well-formed mxfile with one diagram', async () => {
  const arch = await golden();
  const xml = emitDrawio(arch, layout(arch));
  assert.match(xml, /^<mxfile\b/);
  assert.ok(xml.trimEnd().endsWith('</mxfile>'));
  assert.equal((xml.match(/<diagram\b/g) ?? []).length, 1);
  assert.ok(xml.includes('<mxGraphModel'));
  assert.ok(tagsBalanced(xml), 'emitted XML has unbalanced tags');
});

test('it carries the two root cells drawio requires', async () => {
  const arch = await golden();
  const xml = emitDrawio(arch, layout(arch));
  assert.ok(xml.includes('<mxCell id="0"'), 'cell 0 is the model root');
  assert.ok(xml.includes('<mxCell id="1" parent="0"'), 'cell 1 is the default layer');
});

test('every component becomes a vertex with its laid-out geometry', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const xml = emitDrawio(arch, laid);
  assert.equal((xml.match(/vertex="1"/g) ?? []).length,
    laid.boxes.length + laid.boundaries.length,
    'boxes and boundary containers are both vertices');
  for (const b of laid.boxes) {
    assert.ok(xml.includes(`id="${b.id}"`), `no vertex for ${b.id}`);
    assert.ok(xml.includes(`x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"`),
      `wrong geometry for ${b.id}`);
  }
});

test('every edge becomes an mxCell edge with source and target', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const xml = emitDrawio(arch, laid);
  assert.equal((xml.match(/edge="1"/g) ?? []).length, laid.edges.length);
  for (const e of laid.edges) {
    assert.match(xml, new RegExp(`source="${e.from}"[^>]*target="${e.to}"`),
      `edge ${e.from}->${e.to} is missing or malformed`);
  }
});

test('boundaries become dashed container vertices', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const xml = emitDrawio(arch, laid);
  for (const b of laid.boundaries) {
    assert.ok(xml.includes(`id="${b.id}"`), `boundary ${b.id} is missing`);
  }
  assert.ok(xml.includes('dashed=1'), 'boundaries are drawn dashed, as in the Kintwadi source');
});

test('XML special characters in labels are escaped', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'a', label: 'A & B <tag> "q"', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const xml = emitDrawio(arch, layout(arch));
  assert.ok(xml.includes('&amp;'));
  assert.ok(xml.includes('&lt;tag&gt;'));
  assert.ok(xml.includes('&quot;'), 'a raw quote inside a value= attribute breaks the file');
  assert.ok(tagsBalanced(xml));
});

test('the page is at least as large as the canvas', async () => {
  const arch = await golden();
  const laid = layout(arch);
  const xml = emitDrawio(arch, laid);
  const w = Number(/pageWidth="(\d+)"/.exec(xml)[1]);
  const h = Number(/pageHeight="(\d+)"/.exec(xml)[1]);
  assert.ok(w >= laid.canvas.width && h >= laid.canvas.height,
    'a page smaller than the drawing opens scrolled and looks broken');
});

test('a single node with no edges emits a valid file', () => {
  const arch = {
    schema_version: 1, thesis_line: 't', access_control: { model: 'none' },
    components: [{ id: 'only', label: 'Only', tier: 1, trust_zone: 'public',
      what_it_is: 'x', what_it_does: 'x', why_this_choice: 'x' }],
  };
  const xml = emitDrawio(arch, layout(arch));
  assert.ok(tagsBalanced(xml));
  assert.equal((xml.match(/edge="1"/g) ?? []).length, 0);
});
