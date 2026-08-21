import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('plugin manifest is valid', async () => {
  const raw = await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'win-hackathon');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.description.length > 20, 'description should be meaningful');
});

test('package.json declares no runtime dependencies', async () => {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const p = JSON.parse(raw);
  assert.deepEqual(p.dependencies ?? {}, {}, 'plugin scripts must run without npm install');
  assert.equal(p.type, 'module');
});

test('marketplace manifest makes this repo installable', async () => {
  const raw = await readFile(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'win-hackathon');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length === 1);
  assert.equal(m.plugins[0].name, 'win-hackathon');
  assert.equal(m.plugins[0].source, './', 'the plugin root is the repo root');
});

test('manifest and marketplace agree on the plugin name', async () => {
  const [pluginRaw, marketRaw] = await Promise.all([
    readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'),
    readFile(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'),
  ]);
  assert.equal(JSON.parse(pluginRaw).name, JSON.parse(marketRaw).plugins[0].name);
});
