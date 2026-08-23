import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  renderBrief, renderRules, renderCriteria, renderCriteriaMap, TIEBREAK_MARKER, renderIdeas,
} from '../../scripts/lib/render-artifacts.mjs';

async function golden() {
  const raw = await readFile(new URL('../fixtures/h0-recon.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

async function goldenIdeas() {
  const raw = await readFile(new URL('../fixtures/h0-ideas.json', import.meta.url), 'utf8');
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
  // The fact runs one way only: galleries STAY EMPTY until winners are announced. The
  // inverted form ("galleries populate only until winners are announced") claims the
  // reverse and still satisfies a bare /until winners are announced/ — which is exactly
  // how the inverted sentence once shipped into the user's brief.
  assert.match(out, /galleries stay \*\*empty until winners are announced\*\*/);
  assert.doesNotMatch(out, /populate only/i);
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

test('a quote with an embedded newline followed by # or - stays inside the blockquote', async () => {
  const r = await golden();
  const hostile = 'The host says this counts.\n# Not a real heading\n- Not a real list item';
  r.criteria.items[0].quote = hostile;
  const out = renderCriteria(r);

  const lines = out.split('\n');
  const quoteLines = lines.filter((l) => l.startsWith('> '));
  // Every physical line of the hostile quote must appear with its own '> ' prefix.
  assert.ok(quoteLines.includes('> The host says this counts.'));
  assert.ok(quoteLines.includes('> # Not a real heading'));
  assert.ok(quoteLines.includes('> - Not a real list item'));
  // None of the hostile lines may escape to top level (bare heading/list line).
  assert.ok(!lines.includes('# Not a real heading'));
  assert.ok(!lines.includes('- Not a real list item'));
});

test('a quote with a pipe reaching the criteria map table is escaped, not a new column', async () => {
  const r = await golden();
  r.criteria.items[0].quote = 'Score based on craftsmanship | originality | polish';
  const out = renderCriteriaMap(r);

  const row = out.split('\n').find((l) => l.includes('Technical Implementation'));
  // The literal pipes from the quote must be escaped so they don't create extra columns.
  assert.ok(row.includes('craftsmanship \\| originality \\| polish'));
  // A correctly-escaped row still has exactly 4 real columns (5 pipe-delimiters incl. edges).
  const unescaped = row.replace(/\\\|/g, '');
  assert.equal(unescaped.split('|').length - 1, 5);
});

test('the shortlist uses the scannable one-line format', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  // "N. Name — pitch · Track · Primary tech" — the format that survived real use.
  assert.match(out, /1\. \*\*CareCircle\*\* — One shared record for everyone caring for someone\. · b2c/);
});

test('the shortlist is ordered by rank', async () => {
  const d = await goldenIdeas();
  d.ideas.reverse();
  const out = renderIdeas(d, await golden());
  assert.ok(out.indexOf('CareCircle') < out.indexOf('Daily'));
});

test('every scored idea shows its thesis, inversion and demo moment', async () => {
  const d = await goldenIdeas();
  const out = renderIdeas(d, await golden());
  for (const idea of d.ideas) {
    assert.ok(out.includes(idea.thesis), `missing thesis for ${idea.name}`);
    assert.ok(out.includes(idea.inversion), `missing inversion for ${idea.name}`);
    assert.ok(out.includes(idea.demo_moment), `missing demo moment for ${idea.name}`);
  }
});

test('disqualified ideas are listed with their reasons, not hidden', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  assert.match(out, /PromptShelf/);
  assert.match(out, /Disqualified/);
  assert.match(out, /no required AWS database/);
});

test('disqualified ideas never show a score', async () => {
  const out = renderIdeas(await goldenIdeas(), await golden());
  const section = out.slice(out.indexOf('Disqualified'));
  assert.doesNotMatch(section, /\btotal\b/i);
});

test('the round number appears so preserved rounds are distinguishable', async () => {
  const d = await goldenIdeas();
  d.round = 3;
  assert.match(renderIdeas(d, await golden()), /[Rr]ound 3/);
});

test('a round with nothing scored says so plainly', async () => {
  const d = await goldenIdeas();
  d.ideas = [];
  const out = renderIdeas(d, await golden());
  assert.match(out, /No idea (survived|passed)/i);
  assert.doesNotMatch(out, /undefined/);
});

test('renderIdeas works without a rubric', async () => {
  const out = renderIdeas(await goldenIdeas());
  assert.ok(out.length > 0);
  assert.doesNotMatch(out, /undefined/);
});
