import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const commandsDir = path.join(root, 'commands');

async function commandFiles() {
  return (await readdir(commandsDir)).filter((f) => f.endsWith('.md'));
}

test('the three M1 commands exist', async () => {
  const files = await commandFiles();
  for (const f of ['init.md', 'next.md', 'status.md']) {
    assert.ok(files.includes(f), `missing commands/${f}`);
  }
});

test('every command has frontmatter with a description', async () => {
  for (const f of await commandFiles()) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    assert.ok(content.startsWith('---\n'), `${f} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /description:\s*\S/, `${f} needs a description`);
  }
});

test('every script referenced by a command exists', async () => {
  for (const f of await commandFiles()) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    for (const m of content.matchAll(/scripts\/([a-z-]+\.mjs)/g)) {
      await access(path.join(root, 'scripts', m[1]));
    }
  }
});

test('init command states the no-force rule', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  assert.match(content, /never/i);
  assert.match(content, /consent|approval|permission/i);
});

test('next command encodes the stop-on-ambiguity rule', async () => {
  const content = await readFile(path.join(commandsDir, 'next.md'), 'utf8');
  assert.match(content, /drift/i);
  assert.match(content, /awaiting_approval/);
});

test('init command does not claim automatic phase backfilling', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: this used to claim retrofit "backfills" phase statuses from disk —
  // a feature that was never built (createDefaultState() always sets not_started;
  // nothing inspects on-disk artifacts to infer progress). See the corresponding fix
  // and regression test on scripts/lib/init-plan.mjs's retrofit warning.
  assert.doesNotMatch(content, /backfill/i,
    'must not claim automatic backfilling, which does not exist');
  assert.match(content, /not_started/,
    'retrofit guidance should honestly say phases start at not_started');
});

test('init command gives git-init its own consent framing, not the file/marker one', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: Step 2 used to frame every approval-gated action as "a file you did
  // not write" with content to show and a marker block to explain. git-init is also
  // consent-gated (whenever the project isn't already a git repo) but has no file
  // content and no markers, so it needs its own explanation and ask.
  assert.match(content, /git init/i,
    'git initialization is a distinct consent-gated action and needs its own instructions');
});

test('next command sources budget from state.json, not from :next --json', async () => {
  const content = await readFile(path.join(commandsDir, 'next.md'), 'utf8');
  // Regression: resolveNext() only ever returns {outcome, phase, drift, reason} — no
  // budget field. Step 3 used to imply the budget check reads from :next --json's
  // output; it must instead point at .hackathon/state.json directly.
  assert.match(content, /state\.json/,
    'budget must be read from state.json directly, not implied to come from :next --json');
});
