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
