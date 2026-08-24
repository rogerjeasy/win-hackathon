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

// Stage 1 scope. A later Stage 2 task widens these three lists (to four commands and
// ten skills) as the source of truth grows — that widening should be an edit to the
// lists below, not a second, parallel test.
const EXPECTED_COMMANDS = ['stack.md', 'architect.md'];
const EXPECTED_AGENTS = ['solution-architect.md'];
const EXPECTED_SKILLS = [
  'framework-drift-guard', 'security-invariants', 'monorepo-structure',
  'architecture-diagramming', 'frontend-architecture', 'backend-architecture',
  'data-modeling', 'ui-design-principles',
];

test('every Stage 1 command, agent and skill exists on disk', async () => {
  const { readdir } = await import('node:fs/promises');
  const commands = await readdir(new URL('../commands', import.meta.url));
  for (const c of EXPECTED_COMMANDS) {
    assert.ok(commands.includes(c), `commands/${c} is missing`);
  }
  const agents = await readdir(new URL('../agents', import.meta.url));
  for (const a of EXPECTED_AGENTS) {
    assert.ok(agents.includes(a), `agents/${a} is missing`);
  }

  const skills = await readdir(new URL('../skills', import.meta.url));
  for (const s of EXPECTED_SKILLS) {
    assert.ok(skills.includes(s), `skills/${s} is missing`);
  }
});

test('every skill directory has a SKILL.md with frontmatter', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dirs = await readdir(new URL('../skills', import.meta.url), { withFileTypes: true });
  for (const d of dirs.filter((x) => x.isDirectory())) {
    const md = await readFile(new URL(`../skills/${d.name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(md, /^---\nname: /, `skills/${d.name}/SKILL.md has no frontmatter`);
    assert.match(md, /\ndescription: .{20,}/, `skills/${d.name} needs a real description`);
  }
});
