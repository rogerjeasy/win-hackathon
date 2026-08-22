import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderBrief, renderRules, renderCriteria, renderCriteriaMap, TIEBREAK_MARKER,
} from '../../scripts/lib/render-artifacts.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

test('the brief names the hackathon, the deadline and the panel read', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /H0: Hack the Zero Stack/);
  assert.match(out, /2026-06-29T17:00:00-07:00/);
  assert.match(out, /AWS database leadership/);
});

test('the brief lists action deadlines separately from the submission deadline', async () => {
  const out = renderBrief(await golden());
  // The credit form closed three days before submissions did. A single "deadline"
  // heading hides that, which is how free credits get missed.
  assert.match(out, /credit request form closes/);
  assert.match(out, /2026-06-26T12:00:00-07:00/);
});

test('the brief states the bonus ceiling, not just that a bonus exists', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /5\.6/);
  assert.match(out, /#H0Hackathon/);
});

test('the brief reports an empty gallery rather than implying no competition', async () => {
  const out = renderBrief(await golden());
  assert.match(out, /gallery/i);
  assert.match(out, /until winners are announced/);
});

test('the brief surfaces unresolved items when there are any', async () => {
  const r = await golden();
  r.unresolved = ['Whether teams may share one AWS account is not stated anywhere.'];
  const out = renderBrief(r);
  assert.match(out, /Unresolved/);
  assert.match(out, /share one AWS account/);
});

test('the brief says so plainly when nothing is unresolved', async () => {
  const out = renderBrief(await golden());
  assert.doesNotMatch(out, /Unresolved/);
});

test('the criteria rubric marks the tiebreak-first criterion and only that one', async () => {
  const out = renderCriteria(await golden());
  const marks = out.split(TIEBREAK_MARKER).length - 1;
  assert.equal(marks, 1, 'exactly one criterion is the tiebreaker');
  const firstLine = out.split('\n').find((l) => l.includes('Technical Implementation'));
  assert.ok(firstLine.includes(TIEBREAK_MARKER), 'rank 1 carries the marker');
});

test('the criteria rubric renders criteria in rank order regardless of array order', async () => {
  const r = await golden();
  r.criteria.items.reverse();
  const out = renderCriteria(r);
  assert.ok(
    out.indexOf('Technical Implementation') < out.indexOf('Originality'),
    'rank, not array position, decides the order',
  );
});

test('the criteria rubric quotes the host verbatim for every criterion', async () => {
  const r = await golden();
  const out = renderCriteria(r);
  for (const item of r.criteria.items) {
    assert.ok(out.includes(item.quote), `missing verbatim quote for ${item.id}`);
  }
});

test('the criteria rubric explains what equal weighting plus a tiebreak actually means', async () => {
  const out = renderCriteria(await golden());
  assert.match(out, /equally weighted/i);
  assert.match(out, /tie/i);
});

test('the rules artifact carries eligibility exclusions, constraints and ambiguities', async () => {
  const out = renderRules(await golden());
  assert.match(out, /Philippines/);
  assert.match(out, /judge-testing|Judges may score/i);
  assert.match(out, /copy-paste error/);
  assert.match(out, /written request for clarification/);
});

test('the rules artifact lists every hard submission requirement', async () => {
  const r = await golden();
  const out = renderRules(r);
  for (const req of r.submission_requirements.filter((s) => s.hard)) {
    assert.ok(out.includes(req.id), `missing hard requirement ${req.id}`);
  }
});

test('the rules artifact reproduces host guidance verbatim', async () => {
  const r = await golden();
  const out = renderRules(r);
  assert.ok(out.includes(r.host_guidance[0].guidance));
});

test('the criteria map has one row per criterion, in rank order', async () => {
  const r = await golden();
  const out = renderCriteriaMap(r);
  const rows = out.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---'));
  // header + one row per criterion
  assert.equal(rows.length, r.criteria.items.length + 1);
  assert.ok(out.indexOf('Technical Implementation') < out.indexOf('Design'));
});

test('the criteria map leaves the how-we-win column empty for the author to fill', async () => {
  const out = renderCriteriaMap(await golden());
  assert.match(out, /How .* wins it/i);
  assert.match(out, /_/, 'empty cells are marked, not silently blank');
});

test('renderers never emit undefined', async () => {
  const r = await golden();
  for (const [name, fn] of Object.entries({ renderBrief, renderRules, renderCriteria, renderCriteriaMap })) {
    assert.doesNotMatch(fn(r), /undefined/, `${name} leaked an undefined`);
  }
});

test('renderers tolerate a sparse extraction', async () => {
  const r = await golden();
  delete r.bonus;
  delete r.host_guidance;
  delete r.ambiguities;
  delete r.landscape;
  delete r.judges;
  delete r.panel_read;
  for (const fn of [renderBrief, renderRules, renderCriteria, renderCriteriaMap]) {
    const out = fn(r);
    assert.equal(typeof out, 'string');
    assert.doesNotMatch(out, /undefined/);
  }
});
