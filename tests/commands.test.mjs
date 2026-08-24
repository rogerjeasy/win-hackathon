import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const commandsDir = path.join(root, 'commands');
const agentsDir = path.join(root, 'agents');

async function commandFiles() {
  return (await readdir(commandsDir)).filter((f) => f.endsWith('.md'));
}

async function agentFiles() {
  return (await readdir(agentsDir)).filter((f) => f.endsWith('.md'));
}

async function readCommand(file) {
  return readFile(path.join(commandsDir, file), 'utf8');
}

// Installed as a plugin, a bare repo-relative path (e.g. `skills/foo/bar.md`) resolves
// against the USER's project cwd, not the plugin's own directory, and ENOENTs. Every
// reference into the plugin's own tree — scripts, skills, agents, references, hooks — must
// be rooted with ${CLAUDE_PLUGIN_ROOT}. This catches an unrooted path anywhere in a command
// or agent file, not just the scripts/*.mjs paths the older, narrower check covers.
const PLUGIN_DIR_NAMES = ['scripts', 'skills', 'agents', 'references', 'hooks'];
const rootedOrNot = new RegExp(
  `(\\$\\{CLAUDE_PLUGIN_ROOT\\}/)?\\b(${PLUGIN_DIR_NAMES.join('|')})/[\\w./-]+`,
  'g',
);

function findUnrootedPluginPaths(content) {
  const offenders = [];
  for (const m of content.matchAll(rootedOrNot)) {
    if (!m[1]) offenders.push(m[0]);
  }
  return offenders;
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

test('every reference into the plugin tree from a command or agent file is rooted with ${CLAUDE_PLUGIN_ROOT}', async () => {
  for (const [dir, files] of [
    [commandsDir, await commandFiles()],
    [agentsDir, await agentFiles()],
  ]) {
    for (const f of files) {
      const content = await readFile(path.join(dir, f), 'utf8');
      const offenders = findUnrootedPluginPaths(content);
      assert.deepEqual(
        offenders, [],
        `${f} references its own plugin tree without \${CLAUDE_PLUGIN_ROOT}, which ENOENTs `
        + `once installed as a plugin (resolves against the user's project cwd instead): ${offenders.join(', ')}`,
      );
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

test('init command names "." as the git-init consent token', async () => {
  const content = await readFile(path.join(commandsDir, 'init.md'), 'utf8');
  // Regression: scripts/lib/init-plan.mjs's git-init action carries path: '.', which is
  // also the literal --consent token an agent must pass to approve it. The docs never
  // said so explicitly, so an agent writing the --consent list from prose had no way to
  // know to include a bare "." for git-init — a space-separated approval list like
  // "CLAUDE.md, AGENTS.md" would silently never include it.
  assert.match(content, /consent token/i,
    'must explicitly name a consent token for git-init, not just describe the action');
  assert.match(content, /`\.`/,
    'must name the literal "." as that consent token');
});

test('next command sources budget from state.json, not from :next --json', async () => {
  const content = await readFile(path.join(commandsDir, 'next.md'), 'utf8');
  // Regression: resolveNext() only ever returns {outcome, phase, drift, reason} — no
  // budget field. Step 3 used to imply the budget check reads from :next --json's
  // output; it must instead point at .hackathon/state.json directly.
  assert.match(content, /state\.json/,
    'budget must be read from state.json directly, not implied to come from :next --json');
});

test('the three M2 commands exist', async () => {
  const files = await commandFiles();
  for (const f of ['recon.md', 'brainstorm.md', 'describe.md']) {
    assert.ok(files.includes(f), `missing commands/${f}`);
  }
});

test('recon states the retry bound so a failing agent cannot loop forever', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  // recon.mjs validate exits non-zero with a full error list; the command must say how
  // many times to feed that list back before giving up.
  assert.match(content, /twice|two attempts|at most 2/i);
});

test('recon states the never-guess rule and recites unresolved items at the gate', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  assert.match(content, /never guess|do not guess/i);
  assert.match(content, /unresolved/);
  assert.match(content, /ambiguit/i);
});

test('recon does not promise gallery-derived crowding numbers', async () => {
  const content = await readFile(path.join(commandsDir, 'recon.md'), 'utf8');
  // Regression: an earlier draft of the design had :recon reading per-track crowding from
  // /project-gallery. Devpost galleries are empty until winners are announced, so during a
  // live hackathon that number does not exist and must never be implied.
  assert.match(content, /until winners are announced|empty/i);
});

test('brainstorm encodes gate-before-score', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  // Scoped to Step 3 and asserted positionally: the previous version checked only that
  // the three words occurred anywhere in the file, so a command that scored first and
  // gated afterwards would have passed it.
  const from = content.indexOf('## Step 3');
  const to = content.indexOf('## Step 4');
  assert.ok(from !== -1 && to > from, 'brainstorm.md must have a Step 3 and a Step 4');
  const step3 = content.slice(from, to);
  const gate = step3.indexOf('Stage-One gate');
  const scoring = step3.indexOf('per-criterion scoring');
  assert.ok(gate !== -1, 'Step 3 must name the Stage-One gate');
  assert.ok(scoring !== -1, 'Step 3 must name the scoring step');
  assert.ok(gate < scoring, 'the Stage-One gate must be ordered before scoring');
  assert.match(step3.slice(gate, scoring), /disqualified/);
});

test('brainstorm dispatches four generators in parallel and one scorer separately', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  assert.match(content, /parallel/i);
  assert.match(content, /idea-generator/);
  assert.match(content, /idea-scorer/);
  assert.match(content, /fresh context/i);
});

test('brainstorm archives before a fresh round rather than overwriting', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  assert.match(content, /--fresh/);
  assert.match(content, /archive/);
});

test('describe names both output files', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /project\.md/);
  assert.match(content, /strategy\.md/);
});

test('describe requires an explicit track choice', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /--track/);
  assert.match(content, /one prize|single bet|one track/i);
});

test('describe tells the user to read the thesis aloud at the gate', async () => {
  const content = await readFile(path.join(commandsDir, 'describe.md'), 'utf8');
  assert.match(content, /thesis/);
});

test('every M2 command ends at an approval gate rather than advancing', async () => {
  for (const f of ['recon.md', 'brainstorm.md', 'describe.md']) {
    const content = await readFile(path.join(commandsDir, f), 'utf8');
    assert.match(content, /awaiting_approval/, `${f} must set the phase to awaiting_approval`);
    assert.match(content, /stop|do not (continue|advance|proceed)/i, `${f} must stop at the gate`);
  }
});

test('brainstorm states a stop clause for exhausted validation retries so a failing agent cannot proceed to apply', async () => {
  const content = await readFile(path.join(commandsDir, 'brainstorm.md'), 'utf8');
  const step3 = content.slice(content.indexOf('## Step 3'), content.indexOf('## Step 4'));
  // brainstorm.mjs apply runs unconditionally in Step 4; Step 3 must say what to do when
  // the two validation retries are exhausted, or the model proceeds to apply anyway.
  assert.match(step3, /twice|two attempts|at most 2/i);
  assert.match(step3, /stop/i);
  assert.match(step3, /show the user/i);
});

// --- stack.md --------------------------------------------------------------------------

test('the stack command stops at the approval gate, after showing the table', async () => {
  const md = await readCommand('stack.md');
  const gate = md.slice(md.indexOf('## Step 6'));
  assert.match(gate, /\bawaiting_approval\b/);
  assert.ok(md.indexOf('## Step 6') > md.indexOf('## Step 5'),
    'the gate is the last step, not an aside partway through');
  assert.match(gate, /explicit yes/i);
});

test('the stack command loads its three skills before resolving anything', async () => {
  const md = await readCommand('stack.md');
  const preamble = md.slice(0, md.indexOf('## Step 1'));
  for (const skill of ['monorepo-structure', 'sponsor-tech-thesis', 'framework-drift-guard']) {
    assert.ok(preamble.includes(skill), `${skill} must load before the work starts`);
  }
});

test('sponsor-wins precedence is ordered, with required tech first', async () => {
  const md = await readCommand('stack.md');
  const step2 = md.slice(md.indexOf('## Step 2'), md.indexOf('## Step 3'));
  assert.ok(step2.indexOf('Required sponsor tech is fixed') < step2.indexOf('Personal defaults'),
    'defaults must never be presented as outranking a mandate');
  assert.ok(step2.indexOf('Personal defaults') < step2.indexOf('Bonus tech'));
});
