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
const readReference = (skill, file) =>
  readFile(path.join(skillsDir, skill, 'references', file), 'utf8');

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

test('framework-drift-guard ships the canonical banner, not a paraphrase', async () => {
  const md = await readSkill('framework-drift-guard');
  const banner = md.slice(
    md.indexOf('<!-- BEGIN:nextjs-agent-rules -->'),
    md.indexOf('<!-- END:nextjs-agent-rules -->'),
  );
  assert.ok(banner.length > 0, 'the canonical banner block must be present');
  assert.match(banner, /# This is NOT the .* you know/);
  assert.match(banner, /may all differ from your training data/);
  assert.match(banner, /node_modules\/next\/dist\/docs\//);
  assert.match(banner, /Heed deprecation notices\./);
});

test('framework-drift-guard says when NOT to emit a banner', async () => {
  const md = await readSkill('framework-drift-guard');
  const tail = md.slice(md.length / 2);
  assert.match(tail, /\bnot\b[^.]*\bbanner\b|\bbanner\b[^.]*\bnoise\b/i,
    'a skill that only says when to act will act every time');
});

test('security-invariants closes its shape section with the stop-and-flag line', async () => {
  const md = await readSkill('security-invariants');
  const shape = md.slice(md.indexOf('## The shape'), md.indexOf('## Families'));
  assert.ok(shape.includes('stop and flag it instead of shipping it'));
});

test('security-invariants tells the reader a short contract is legitimate', async () => {
  const md = await readSkill('security-invariants');
  const scaling = md.slice(md.indexOf('## Scaling'), md.indexOf('## The reader'));
  assert.match(scaling, /\bSonar\b/, 'the claim needs its evidence beside it');
  assert.match(scaling, /never pad|do not pad/i);
});

test('the invariants corpus carries all four shapes with their prizes', async () => {
  const md = await readReference('security-invariants', 'invariants-corpus.md');
  for (const [project, prize] of [
    ['Kintwadi', 'Best Design'],
    ['Sonar', 'First Place'],
    ['HYPE', 'Best Technical Implementation'],
    ['Karma', 'Second Place'],
  ]) {
    const row = md.split('\n').find((l) => l.includes(project) && l.includes(prize));
    assert.ok(row, `${project} must appear with its real prize (${prize})`);
  }
});

test('the corpus states what it cannot say', async () => {
  const md = await readReference('security-invariants', 'invariants-corpus.md');
  assert.match(md.slice(md.lastIndexOf('##')), /cannot say|read from the outside/i);
});

test('monorepo-structure carries both real shapes with their evidence project', async () => {
  const md = await readSkill('monorepo-structure');
  const mono = md.slice(md.indexOf('## next-monolith'), md.indexOf('## multi-service'));
  assert.match(mono, /\bKintwadi\b/);
  assert.match(mono, /\(app\)/, 'the protected route group is the load-bearing detail');
  const multi = md.slice(md.indexOf('## multi-service'));
  assert.match(multi, /\bKarma\b/);
  assert.match(multi, /\bagents\/\B|\bagents\/\b/, 'Karma has three services, not two');
});

test('monorepo-structure gives criteria, not just descriptions', async () => {
  const md = await readSkill('monorepo-structure');
  assert.ok(md.indexOf('## Choosing') > md.indexOf('## multi-service'),
    'the criteria come after both shapes are on the table');
  assert.match(md.slice(md.indexOf('## Choosing')), /network hop|deploy target/);
});

test('architecture-diagramming records that nobody automated a PNG export, exactly once', async () => {
  const md = await readSkill('architecture-diagramming');
  // Scoped to the corpus section, and counted rather than merely matched: a looser pattern
  // (e.g. one also matching "PNG ... by hand") is satisfiable by supporting prose elsewhere
  // in the same paragraph even after the claim sentence itself is deleted -- that decoy is
  // exactly what shipped here once already. "automat" is a rare, specific anchor, so a count
  // of 1 means the claim sentence itself is present, not just PNG- or hand-adjacent prose.
  const corpus = md.slice(md.indexOf('## The corpus'), md.indexOf('## The tier model'));
  const matches = corpus.match(/\bno\b[^.]*automat[^.]*PNG/gi) ?? [];
  assert.equal(matches.length, 1,
    'the claim must appear exactly once in the corpus section, or the test can be defeated ' +
    'by deleting the one copy while unrelated prose keeps it passing');
});

test('architecture-diagramming warns that hand edits are lost', async () => {
  const md = await readSkill('architecture-diagramming');
  assert.match(md, /architecture\.json/);
  assert.match(md, /hand edit|edited by hand/i);
});

test('frontend-architecture states protection is the default, not an opt-in', async () => {
  const md = await readSkill('frontend-architecture');
  // Scoped to the body, not the frontmatter: the description line alone used to be the only
  // thing satisfying these two assertions, so stripping the whole body and keeping just the
  // frontmatter passed. The body must say it itself.
  const body = md.slice(md.indexOf('\n---', 4) + 4);
  assert.match(body, /\bdefault\b/,
    'the body itself must state the default, not just the frontmatter description');
  assert.match(body, /opt-in/i,
    'the body itself must say "opt-in", not just the frontmatter description');
  assert.ok(md.indexOf('requireSession') < md.indexOf('proxy.ts'),
    'the server guard is primary; the edge allowlist is the optimistic layer and comes second');
});

test('backend-architecture keeps token scopes separated', async () => {
  const md = await readSkill('backend-architecture');
  // Scoped to the token-scope section itself. "scope" (8x) and "Karma" (8x) both appear
  // throughout the file -- in the DAL section, the closing summary -- so an unscoped match
  // survives deleting this entire section. Require the section to exist between its own
  // heading and the next, and require it to name the actual three tokens, not just the word
  // "scope".
  const start = md.indexOf('## Separated token scopes');
  const end = md.indexOf('## Dependency injection');
  assert.ok(start !== -1 && end > start,
    'the token-scope section must exist, between its own heading and the next one');
  const section = md.slice(start, end);
  assert.match(section, /\bKarma\b/, 'the practice needs the project it was measured in');
  for (const token of ['DT_API_TOKEN', 'DT_OTEL_TOKEN', 'DT_QUERY_TOKEN']) {
    assert.ok(section.includes(token), `token-scope section is missing ${token}`);
  }
});

test('data-modeling requires a policy in the same change as a new table', async () => {
  const md = await readSkill('data-modeling');
  assert.match(md, /same change/i);
});

test('ui-design-principles carries the anti-generic list verbatim', async () => {
  const md = await readSkill('ui-design-principles');
  for (const rule of ['gradient', 'neon', 'glassmorphism', 'emoji']) {
    assert.match(md, new RegExp(`\\b${rule}`, 'i'), `the anti-generic list is missing "${rule}"`);
  }
  assert.match(md, /#000|pure black/i);
});

test('ui-design-principles fixes the system before the first screen', async () => {
  const md = await readSkill('ui-design-principles');
  const closing = md.slice(md.lastIndexOf('##'));
  assert.match(closing, /before the first screen|once.*reuse/i,
    'this is the rule that produced the Best Design win; it belongs at the end, as the takeaway');
});

test('ui-design-principles names all four breakpoints', async () => {
  const md = await readSkill('ui-design-principles');
  for (const bp of ['375', '820', '1024', '1440']) assert.ok(md.includes(bp), `missing ${bp}px`);
});
