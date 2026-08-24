import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const agentsDir = path.join(root, 'agents');

async function agentFiles() {
  return (await readdir(agentsDir)).filter((f) => f.endsWith('.md'));
}
const read = (f) => readFile(path.join(agentsDir, f), 'utf8');
async function readAgent(file) {
  return readFile(path.join(agentsDir, file), 'utf8');
}

test('the three M2 agents exist', async () => {
  const files = await agentFiles();
  for (const f of ['hackathon-recon.md', 'idea-generator.md', 'idea-scorer.md']) {
    assert.ok(files.includes(f), `missing agents/${f}`);
  }
});

test('every agent has frontmatter with a name, description and tools', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    assert.ok(content.startsWith('---\n'), `${f} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${f} needs a name`);
    assert.match(fm, /description:\s*\S/, `${f} needs a description`);
    assert.match(fm, /tools:\s*\S/, `${f} needs a tools list`);
  }
});

test('every agent filename matches its declared name', async () => {
  for (const f of await agentFiles()) {
    const content = await read(f);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    const name = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(name, f.replace(/\.md$/, ''), `${f} declares name "${name}"`);
  }
});

test('the recon agent is told to return only the payload, never raw HTML', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /recon\.json/);
  // The agent exists so that hundreds of KB of Devpost markup never reach the main
  // context. If it summarises into the conversation instead, it has no reason to exist.
  assert.match(content, /only the JSON|nothing but the JSON|JSON payload and nothing/i);
});

test('the recon agent is told never to guess', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /unresolved/);
  assert.match(content, /never guess|do not guess/i);
});

test('the recon agent knows galleries are empty before announcement', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /until winners are announced/);
});

test('the recon agent requires a quote for every claim', async () => {
  const content = await read('hackathon-recon.md');
  assert.match(content, /quote/);
});

test('the recon agent is told to check pages beyond the rules', async () => {
  const content = await read('hackathon-recon.md');
  for (const p of ['/rules', '/resources', '/updates', '/project-gallery']) {
    assert.ok(content.includes(p), `recon agent should fetch ${p}`);
  }
});

test('the recon agent states its final-message contract once, in the Output section, without the opening contradicting it', async () => {
  const content = await read('hackathon-recon.md');
  const outputIdx = content.indexOf('## Output');
  assert.ok(outputIdx > -1, 'hackathon-recon.md needs an Output section');
  const preamble = content.slice(0, outputIdx);
  const outputSection = content.slice(outputIdx);

  // The actual contract: the agent's final message is a file path plus a summary of what
  // it could not resolve. This must live in the Output section.
  assert.match(outputSection, /final message/i);
  assert.match(outputSection, /path/i);
  assert.match(outputSection, /summary/i);
  assert.match(outputSection, /unresolved|could not resolve/i);

  // The opening must not itself claim the agent's final message IS the JSON payload with
  // no summary — that's the exact contradiction this test guards against. The "only the
  // JSON" language is fine when scoped to the file on disk, not to what gets returned.
  assert.doesNotMatch(
    preamble,
    /you return only the (json|payload)/i,
    'the opening must not claim the agent itself returns the JSON payload — the file does, per the Output section'
  );
});

test('the idea generator is given exactly one angle and told not to score', async () => {
  const content = await read('idea-generator.md');
  assert.match(content, /angle/i);
  assert.match(content, /do not score|never score|scoring is not/i);
});

test('the scorer runs the Stage-One gate before scoring', async () => {
  const content = await read('idea-scorer.md');
  // Ordering IS the claim. Asserting that "Stage One", "disqualified" and "before" each
  // appear somewhere passes on a file whose steps run in reverse -- which is exactly what
  // the previous version did. Assert the positions instead.
  const gate = content.indexOf('The Stage-One gate');
  const scoring = content.indexOf('Only now, score');
  assert.ok(gate !== -1, 'the Stage-One gate step must be named');
  assert.ok(scoring !== -1, 'the scoring step must be named');
  assert.ok(gate < scoring, 'the Stage-One gate must be ordered before scoring');
  assert.match(content.slice(gate, scoring), /disqualified/,
    'the gate must route failures to disqualified before any scoring happens');
});

test('the scorer applies the inversion and thesis tests', async () => {
  const content = await read('idea-scorer.md');
  assert.match(content, /inversion/i);
  assert.match(content, /thesis/i);
});

test('the scorer is told ties break on the first-ranked criterion', async () => {
  const content = await read('idea-scorer.md');
  assert.match(content, /rank/i);
  assert.match(content, /tie/i);
});

// --- solution-architect.md --------------------------------------------------------------

test('solution-architect exists', async () => {
  const files = await agentFiles();
  assert.ok(files.includes('solution-architect.md'), 'missing agents/solution-architect.md');
});

test('solution-architect is told to write only the payload', async () => {
  const md = await readAgent('solution-architect.md');
  const top = md.slice(0, md.indexOf('## Read first'));
  assert.match(top, /only output is/i);
  assert.ok(/do not write markdown/i.test(md) && /do not draw diagrams/i.test(md));
});

test('solution-architect is warned against padding the invariants', async () => {
  const md = await readAgent('solution-architect.md');
  const dont = md.slice(md.indexOf('## Do not'));
  assert.match(dont, /invent invariants/i);
});
