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
  assert.match(content, /Stage One/i);
  assert.match(content, /tie/i);
  assert.match(content, /bonus/i);
  assert.match(content, /expected value|EV/i);
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
