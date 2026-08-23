import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = path.join(root, 'skills');

async function skillNames() {
  const entries = await readdir(skillsDir);
  const names = [];
  for (const e of entries) {
    if ((await stat(path.join(skillsDir, e))).isDirectory()) names.push(e);
  }
  return names;
}
const readSkill = (name) => readFile(path.join(skillsDir, name, 'SKILL.md'), 'utf8');

test('the M2 process skills exist', async () => {
  const names = await skillNames();
  for (const n of ['devpost-recon', 'judging-criteria-scoring', 'project-description']) {
    assert.ok(names.includes(n), `missing skills/${n}`);
  }
});

test('every skill has frontmatter with a name and a description', async () => {
  for (const n of await skillNames()) {
    const content = await readSkill(n);
    assert.ok(content.startsWith('---\n'), `${n} must open with frontmatter`);
    const fm = content.slice(4, content.indexOf('\n---', 4));
    assert.match(fm, /name:\s*\S/, `${n} needs a name`);
    assert.match(fm, /description:\s*\S/, `${n} needs a description`);
  }
});

test('every skill directory name matches its declared name', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4);
    const declared = fm.match(/name:\s*(\S+)/)[1];
    assert.equal(declared, n);
  }
});

test('every skill description says when to use it, not just what it is', async () => {
  for (const n of await skillNames()) {
    const fm = (await readSkill(n)).slice(4, (await readSkill(n)).indexOf('\n---', 4));
    const desc = fm.match(/description:\s*(.+)/)[1];
    assert.ok(desc.length > 40, `${n}'s description is too thin to route on: "${desc}"`);
  }
});

test('devpost-recon names the pages that are easy to miss', async () => {
  const content = await readSkill('devpost-recon');
  for (const p of ['/updates', '/project-gallery', '/resources']) {
    assert.ok(content.includes(p), `devpost-recon should cover ${p}`);
  }
  assert.match(content, /until winners are announced/);
});

test('devpost-recon covers partner pages and FAQ scoring language', async () => {
  const content = await readSkill('devpost-recon');
  assert.match(content, /partner|sponsor section/i);
  assert.match(content, /FAQ/);
});

test('devpost-recon covers dated actions and rule ambiguities', async () => {
  const content = await readSkill('devpost-recon');
  assert.match(content, /action/i);
  assert.match(content, /ambigu/i);
  assert.match(content, /clarification/i);
});

test('judging-criteria-scoring covers all four scoring mechanics', async () => {
  const content = await readSkill('judging-criteria-scoring');
  // Word boundaries and section scoping both matter here. A bare /tie/i matches inside
  // "Properties" and a bare /EV/i matches inside "eleven" -- so the previous version of
  // this test passed with the tiebreak and expected-value sections deleted outright.
  const section = (start, end) => {
    const from = content.indexOf(start);
    const to = content.indexOf(end);
    assert.ok(from !== -1, `missing section: ${start}`);
    assert.ok(to > from, `missing section: ${end}`);
    return content.slice(from, to);
  };
  assert.match(content, /Stage One/i);
  assert.match(section('## "Equally weighted"', '## The score ceiling'), /\bties?\b|\btiebreak/i,
    'the tiebreak section must actually discuss ties');
  assert.match(content, /bonus/i);
  assert.match(section('## Choosing a track', '## Scoring honestly'), /\bexpected[-\s]value\b|\bEV\b/,
    'the track-choice section must actually discuss expected value');
});

test('judging-criteria-scoring is honest about unobservable crowding', async () => {
  const content = await readSkill('judging-criteria-scoring');
  assert.match(content, /gallery/i);
  assert.match(content, /cannot|unknown|unobservable/i);
});

test('project-description carries the section spine and the named-characters rule', async () => {
  const content = await readSkill('project-description');
  assert.match(content, /why now/i);
  assert.match(content, /day in the life/i);
  assert.match(content, /named/i);
  assert.match(content, /seed data|seeded/i);
});

test('project-description carries the heading-per-criterion rule', async () => {
  const content = await readSkill('project-description');
  assert.match(content, /heading/i);
  assert.match(content, /criterion|criteria/i);
});

test('the evidence-bearing skills exist', async () => {
  const names = await skillNames();
  for (const n of ['winning-ideation', 'sponsor-tech-thesis']) {
    assert.ok(names.includes(n), `missing skills/${n}`);
  }
});

test('winning-ideation ships the winner corpus as a reference', async () => {
  const p = path.join(skillsDir, 'winning-ideation/references/winner-corpus.md');
  const corpus = await readFile(p, 'utf8');
  // A length check is not an evidence check. The previous `corpus.length > 2000` passed
  // against 3.4KB of the twelve project names repeated -- no pitches, theses, inversions
  // or prizes. Require every project to have a table row whose columns are filled in.
  const projects = [
    'Waylo', 'Sammy', 'Sonar', 'HYPE', 'Relay', 'Kintwadi',
    'Cassandra', 'CrisisRoute', 'Karma',
    'BackstageCommercials', 'Title AI', 'Project Memoria',
  ];
  const rows = corpus.split('\n');
  for (const name of projects) {
    const row = rows.find((l) => l.startsWith(`| **${name}**`));
    assert.ok(row, `${name} has no table row in the corpus`);
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    assert.ok(cells.length >= 4, `${name}'s row has ${cells.length} columns, expected >= 4`);
    for (const [i, cell] of cells.entries()) {
      assert.ok(cell.length > 3, `${name}'s column ${i + 1} is empty`);
    }
    assert.ok(row.length > 120, `${name}'s row is too thin to be evidence: ${row.length} chars`);
  }
});

test('the corpus names every project it claims to cover', async () => {
  const corpus = await readFile(
    path.join(skillsDir, 'winning-ideation/references/winner-corpus.md'), 'utf8',
  );
  for (const name of [
    'Waylo', 'Sammy', 'Sonar', 'HYPE', 'Relay', 'Kintwadi',
    'Cassandra', 'CrisisRoute', 'Karma',
    'BackstageCommercials', 'Title AI', 'Project Memoria',
  ]) {
    assert.ok(corpus.includes(name), `corpus is missing ${name}`);
  }
});

test('the corpus records the prize each project won', async () => {
  const corpus = await readFile(
    path.join(skillsDir, 'winning-ideation/references/winner-corpus.md'), 'utf8',
  );
  assert.match(corpus, /Best Design/);
  assert.match(corpus, /Best Technical Implementation/);
  assert.match(corpus, /First Place/i);
});

test('winning-ideation points the reader at a reachable corpus path', async () => {
  const content = await readSkill('winning-ideation');
  // Renamed deliberately. The old name promised "rather than restating it", but the
  // no-restatement property is PARKED (the skill does quote a few corpus inversions
  // inline, and restructuring three skills into citation form was ruled out of scope).
  // A test whose name certifies a property nobody enforces is worse than no test, so
  // this now checks the weaker thing it can honestly check: that a reader is pointed at
  // a full, reachable path and told to go read it -- not shown a bare filename.
  assert.match(content, /references\/winner-corpus\.md/,
    'must give the path to the corpus, not just the basename');
  const idx = content.indexOf('winner-corpus.md');
  const around = content.slice(Math.max(0, idx - 240), idx + 240);
  assert.match(around, /\bread\b|\bsee\b|\bconsult\b/i,
    'the corpus reference must read as an instruction to go read it');
});

test('winning-ideation carries the inversion test and the anti-patterns', async () => {
  const content = await readSkill('winning-ideation');
  assert.match(content, /inversion/i);
  assert.match(content, /todo app/i);
  assert.match(content, /wrapper/i);
});

test('winning-ideation carries the demoability and quantification tests', async () => {
  const content = await readSkill('winning-ideation');
  assert.match(content, /three minutes|3 minutes|demo moment/i);
  assert.match(content, /number|quantif/i);
});

test('sponsor-tech-thesis states the placement rule with its evidence', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  assert.match(content, /top-level heading/i);
  // The finding this skill exists for: same argument, different placement, different prize.
  assert.match(content, /Kintwadi/);
  assert.match(content, /Relay|HYPE|Sonar/);
});

test('sponsor-tech-thesis names the four phases that load it', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  for (const phase of ['brainstorm', 'describe', 'architect', 'submit']) {
    assert.ok(content.includes(phase), `should say how :${phase} uses the thesis`);
  }
});

test('sponsor-tech-thesis warns about a thesis the architecture cannot support', async () => {
  const content = await readSkill('sponsor-tech-thesis');
  assert.match(content, /cannot support|does not support|unsupported|cash the cheque|earn it/i);
});
