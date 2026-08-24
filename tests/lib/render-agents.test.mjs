import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderDriftBanner, renderInvariants, renderAgentsMd, renderClaudeMd }
  from '../../scripts/lib/render-agents.mjs';
import { readBlock } from '../../scripts/lib/markers.mjs';

const fx = async (n) =>
  JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));

test('the drift banner matches the canonical text two winners shipped', async () => {
  const banner = renderDriftBanner(await fx('h0-stack.json'));
  assert.match(banner, /# This is NOT the Next\.js you know/);
  assert.match(banner, /may all differ from your training data/);
  assert.match(banner, /node_modules\/next\/dist\/docs\//);
  assert.match(banner, /Heed deprecation notices\./);
});

test('no bleeding-edge pin means no banner at all', () => {
  const stack = { schema_version: 1, repo_shape: 'next-monolith', slots: [], bleeding_edge: [] };
  assert.equal(renderDriftBanner(stack), null,
    'a banner about a framework nobody pinned is noise');
});

test('the banner names the pinned package, not always Next.js', () => {
  const stack = {
    schema_version: 1, repo_shape: 'multi-service', slots: [],
    bleeding_edge: [{ slot: 'api', package: 'fastapi', pin: '0.200', docs_path: '.venv/docs/' }],
  };
  const banner = renderDriftBanner(stack);
  assert.match(banner, /\bfastapi\b/i);
  assert.match(banner, /\.venv\/docs\//);
});

test('invariants are numbered and each names its enforcement point', async () => {
  const a = await fx('h0-architecture.json');
  const body = renderInvariants(a);
  for (const [i, inv] of a.invariants.entries()) {
    assert.ok(body.includes(`${i + 1}.`), `invariant ${i + 1} is not numbered`);
    assert.ok(body.includes(inv.statement));
    assert.ok(body.includes(inv.enforced_by));
  }
});

test('the numbered list closes with the stop-and-flag instruction', async () => {
  const body = renderInvariants(await fx('h0-architecture.json'));
  const closing = 'stop and flag it instead of shipping it';
  assert.ok(body.includes(closing));
  const lastNumbered = body.lastIndexOf('. ', body.indexOf(closing));
  assert.ok(lastNumbered !== -1 && body.indexOf(closing) > lastNumbered,
    'the instruction closes the list — it is the sentence the whole contract builds to');
});

test('a project with no invariants gets a short honest file, not invented ones', () => {
  const bare = { schema_version: 1, thesis_line: 't', components: [], invariants: [],
    access_control: { model: 'none' } };
  const body = renderInvariants(bare);
  assert.equal(body, '', 'Sonar won first place with a banner-only AGENTS.md');
});

test('renderAgentsMd puts the drift banner above the invariants', async () => {
  const md = renderAgentsMd('', await fx('h0-architecture.json'), await fx('h0-stack.json'));
  assert.ok(md.indexOf('NOT the Next.js') < md.indexOf('Security invariants'),
    'read-the-docs comes before the rules that assume you did');
});

test('renderAgentsMd preserves hand-written content outside the blocks', async () => {
  const existing = '# AGENTS.md\n\nMy own house rule: never commit on a Friday.\n';
  const md = renderAgentsMd(existing, await fx('h0-architecture.json'), await fx('h0-stack.json'));
  assert.ok(md.includes('never commit on a Friday'),
    'a rerun must not eat what the user added by hand');
  assert.ok(readBlock(md) !== null);
});

test('rerunning renderAgentsMd is idempotent', async () => {
  const a = await fx('h0-architecture.json');
  const s = await fx('h0-stack.json');
  const once = renderAgentsMd('', a, s);
  assert.equal(renderAgentsMd(once, a, s), once);
});

test('renderClaudeMd creates the pointer, and adds it to an existing file', () => {
  assert.equal(renderClaudeMd('').trim(), '@AGENTS.md');
  assert.equal(renderClaudeMd('@AGENTS.md\n').trim(), '@AGENTS.md',
    'already-correct files are left exactly as they are');
  const existing = '# Project notes\n\nSomething.\n';
  const out = renderClaudeMd(existing);
  assert.ok(out.includes('Something.'), 'existing content is never replaced');
  assert.ok(out.includes('@AGENTS.md'));
});
