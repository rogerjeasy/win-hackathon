import test from 'node:test';
import assert from 'node:assert/strict';
import { BEGIN, END, hasBlock, readBlock, upsertBlock, isFullyManaged }
  from '../../scripts/lib/markers.mjs';

test('marker strings are exactly as specified', () => {
  assert.equal(BEGIN, '<!-- BEGIN:win-hackathon -->');
  assert.equal(END, '<!-- END:win-hackathon -->');
});

test('hasBlock is false for unmanaged content', () => {
  assert.equal(hasBlock('# My rules\n'), false);
});

test('upsertBlock appends to an existing file without touching its content', () => {
  const original = '# My rules\n\nDo not break things.\n';
  const out = upsertBlock(original, 'phase: recon');
  assert.ok(out.startsWith('# My rules\n\nDo not break things.'),
    'original content must be preserved verbatim at the start');
  assert.ok(hasBlock(out));
  assert.equal(readBlock(out), 'phase: recon');
});

test('upsertBlock replaces only the block on a second write', () => {
  const original = '# My rules\n\nDo not break things.\n';
  const once = upsertBlock(original, 'phase: recon');
  const twice = upsertBlock(once, 'phase: build');
  assert.equal(readBlock(twice), 'phase: build');
  assert.equal(twice.match(/BEGIN:win-hackathon/g).length, 1, 'must not duplicate the block');
  assert.ok(twice.includes('Do not break things.'));
});

test('upsertBlock preserves content that follows the block', () => {
  const content = `intro\n\n${BEGIN}\nold\n${END}\n\noutro\n`;
  const out = upsertBlock(content, 'new');
  assert.ok(out.includes('intro'));
  assert.ok(out.includes('outro'));
  assert.equal(readBlock(out), 'new');
});

test('upsertBlock handles an empty file', () => {
  const out = upsertBlock('', 'body');
  assert.equal(readBlock(out), 'body');
  assert.ok(!out.startsWith('\n'), 'no leading blank line on an empty file');
});

test('body containing marker-like text does not corrupt the block', () => {
  const out = upsertBlock('intro\n', 'see <!-- BEGIN:other --> for details');
  assert.equal(readBlock(out), 'see <!-- BEGIN:other --> for details');
  assert.equal(out.match(/BEGIN:win-hackathon/g).length, 1);
});

test('isFullyManaged is true only when the file is nothing but our block', () => {
  const ours = `${BEGIN}\nbody\n${END}\n`;
  assert.equal(isFullyManaged(ours), true);
  assert.equal(isFullyManaged(`preface\n${ours}`), false);
  assert.equal(isFullyManaged('no markers here'), false);
});

test('readBlock returns null when unmanaged', () => {
  assert.equal(readBlock('nothing'), null);
});

test('upsertBlock throws if body contains BEGIN marker', () => {
  assert.throws(() => {
    upsertBlock('', `text with ${BEGIN} in it`);
  }, Error);
});

test('upsertBlock throws if body contains END marker', () => {
  assert.throws(() => {
    upsertBlock('', `text with ${END} in it`);
  }, Error);
});

test('a named block is independent of the default one', () => {
  let md = upsertBlock('', 'invariants body');
  md = upsertBlock(md, 'drift body', 'nextjs-agent-rules');
  assert.ok(md.includes('<!-- BEGIN:win-hackathon -->'));
  assert.ok(md.includes('<!-- BEGIN:nextjs-agent-rules -->'));
  assert.equal(readBlock(md), 'invariants body');
  assert.equal(readBlock(md, 'nextjs-agent-rules'), 'drift body');
});

test('updating one named block leaves the other untouched', () => {
  let md = upsertBlock(upsertBlock('', 'first'), 'drift', 'nextjs-agent-rules');
  md = upsertBlock(md, 'second');
  assert.equal(readBlock(md), 'second');
  assert.equal(readBlock(md, 'nextjs-agent-rules'), 'drift', 'the other block must not move or change');
});

test('hand-written content outside every block survives', () => {
  const hand = '# My notes\n\nSomething I wrote by hand.';
  const md = upsertBlock(hand, 'generated');
  assert.ok(md.includes('Something I wrote by hand.'));
  assert.equal(readBlock(md), 'generated');
});
