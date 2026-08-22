export const TIEBREAK_MARKER = '**(tiebreak first)**';

const byRank = (items = []) => [...items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
const bullet = (s) => `- ${s}`;

/** Escape a cell so a quote containing a pipe cannot break the markdown table. */
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/**
 * Render a payload string as a blockquote-safe block: every line is prefixed
 * with `> ` so an embedded newline followed by `#`, `-`, `>`, or a blank line
 * cannot break out of the blockquote under CommonMark. Trailing blank lines
 * are trimmed first so we never emit a bare `> ` line that terminates the
 * quote early.
 */
const quoteBlock = (s) => String(s ?? '').replace(/\n+$/, '').split('\n').map((line) => `> ${line}`).join('\n');

export function renderBrief(recon) {
  const lines = [];
  const id = recon.identity ?? {};
  const dates = recon.dates ?? [];
  const hard = dates.find((d) => d.kind === 'hard');
  const actions = dates.filter((d) => d.kind === 'action');
  const info = dates.filter((d) => d.kind === 'informational');

  lines.push(`# ${id.name ?? 'Hackathon'} — brief`);
  lines.push('');
  if (id.host) lines.push(`**Host:** ${id.host}`);
  if (id.administrator) lines.push(`**Administrator:** ${id.administrator}`);
  if (recon.source?.url) lines.push(`**Source:** ${recon.source.url}`);
  lines.push('');

  lines.push('## Deadlines');
  lines.push('');
  if (hard) lines.push(`**Submission deadline — ${hard.at}.** ${hard.label}.`);
  if (actions.length > 0) {
    lines.push('');
    lines.push('Dated actions that close *before* the work is due — miss these and you lose the resource, not the hackathon:');
    lines.push('');
    for (const d of actions) lines.push(bullet(`**${d.at}** — ${d.label}`));
  }
  if (info.length > 0) {
    lines.push('');
    lines.push('For reference:');
    lines.push('');
    for (const d of info) lines.push(bullet(`${d.at} — ${d.label}`));
  }
  lines.push('');

  if (recon.stage_one?.exists) {
    lines.push('## Stage One — pass/fail before anything is scored');
    lines.push('');
    for (const g of recon.stage_one.gates ?? []) lines.push(bullet(`**${g.id}** — ${g.requirement}`));
    if (recon.stage_one.quote) {
      lines.push('');
      lines.push(quoteBlock(recon.stage_one.quote));
    }
    lines.push('');
  }

  const required = recon.tech?.required ?? [];
  if (required.length > 0) {
    lines.push('## Required technology (non-negotiable)');
    lines.push('');
    for (const t of required) {
      const oneOf = Array.isArray(t.one_of) && t.one_of.length > 0
        ? ` — one of: ${t.one_of.join(', ')}`
        : '';
      lines.push(bullet(`**${t.name}**${oneOf}`));
    }
    lines.push('');
  }

  const tracks = recon.tracks ?? [];
  if (tracks.length > 0) {
    lines.push('## Tracks and prizes');
    lines.push('');
    for (const t of tracks) {
      const first = (t.prizes ?? []).find((p) => /first/i.test(p.place ?? ''));
      const amount = first?.cash_usd != null ? ` — first place $${first.cash_usd.toLocaleString('en-US')}` : '';
      lines.push(bullet(`**${t.name}** (\`${t.id}\`)${amount}`));
    }
    if ((recon.open_prizes ?? []).length > 0) {
      lines.push('');
      lines.push('Open to every submission regardless of track:');
      lines.push('');
      for (const p of recon.open_prizes) {
        const amount = p.cash_usd != null ? ` — $${p.cash_usd.toLocaleString('en-US')}` : '';
        lines.push(bullet(`**${p.name}**${amount}`));
      }
    }
    if (recon.prize_rules?.one_prize_per_project) {
      lines.push('');
      lines.push('> Each project is eligible to win **one** prize. Track choice is a single bet.');
    }
    lines.push('');
  }

  if (recon.bonus?.available) {
    const b = recon.bonus;
    lines.push('## Bonus points — the cheapest score on offer');
    lines.push('');
    lines.push(
      `Up to **+${b.max_points}** (${b.per_item_points} per published piece), raising the ceiling `
      + `from ${recon.criteria?.max_base_score ?? '?'} to **${b.max_score_with_bonus}**.`,
    );
    lines.push('');
    if ((b.kinds ?? []).length > 0) lines.push(bullet(`Accepted: ${b.kinds.join(', ')}`));
    if ((b.platforms ?? []).length > 0) lines.push(bullet(`Platforms: ${b.platforms.join(', ')}`));
    if (b.required_disclosure) lines.push(bullet(`Required disclosure: "${b.required_disclosure}"`));
    if (b.hashtag) lines.push(bullet(`Hashtag: ${b.hashtag}`));
    lines.push('');
  }

  const judges = recon.judges ?? [];
  if (judges.length > 0 || recon.panel_read) {
    lines.push('## The panel');
    lines.push('');
    if (recon.panel_read) {
      lines.push(recon.panel_read);
      lines.push('');
    }
    for (const j of judges) {
      lines.push(bullet(`${j.name}${j.title ? ` — ${j.title}` : ''}${j.org ? `, ${j.org}` : ''}`));
    }
    lines.push('');
  }

  const ls = recon.landscape;
  if (ls) {
    lines.push('## Field');
    lines.push('');
    if (ls.total_participants != null) {
      lines.push(bullet(
        `${ls.total_participants.toLocaleString('en-US')} registered`
        + (ls.participants_caveat ? ` — ${ls.participants_caveat}` : ''),
      ));
    }
    if (ls.gallery_available === true && ls.entries_observed != null) {
      lines.push(bullet(`${ls.entries_observed} entries visible in the project gallery`));
    } else {
      lines.push(bullet(
        'Project gallery is empty — Devpost galleries populate only **until winners are announced**, '
        + 'so per-track crowding cannot be observed during a live hackathon.',
      ));
    }
    for (const p of ls.prior_editions ?? []) {
      lines.push(bullet(`Prior edition **${p.name}** — ${p.entries_observed ?? 'unknown'} entries, ${(p.winners ?? []).length} winners recorded`));
    }
    lines.push('');
  }

  const unresolved = recon.unresolved ?? [];
  if (unresolved.length > 0) {
    lines.push('## Unresolved');
    lines.push('');
    lines.push('Recon could not determine the following. These are open questions, not assumptions:');
    lines.push('');
    for (const u of unresolved) lines.push(bullet(u));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderCriteria(recon) {
  const c = recon.criteria ?? {};
  const items = byRank(c.items);
  const lines = [];

  lines.push(`# Judging rubric — ${recon.identity?.name ?? 'Hackathon'}`);
  lines.push('');
  lines.push(
    c.weighting === 'equal'
      ? `The criteria are **equally weighted**, out of ${c.max_base_score ?? '?'}.`
      : `The criteria are **weighted**, out of ${c.max_base_score ?? '?'}.`,
  );
  if (c.tiebreak === 'listed_order') {
    lines.push('');
    lines.push(
      'Ties are broken by the **first listed criterion**, then the next, and so on. Equal '
      + 'weighting therefore does not mean equal value: the top-ranked criterion decides '
      + 'close calls and is worth more than its weight suggests.',
    );
  } else if (c.tiebreak === 'judge_vote') {
    lines.push('');
    lines.push('Ties are broken by a vote of the judging panel.');
  }
  lines.push('');

  for (const item of items) {
    const marker = item.rank === 1 && c.tiebreak === 'listed_order' ? ` ${TIEBREAK_MARKER}` : '';
    lines.push(`## ${item.rank}. ${item.name}${marker}`);
    lines.push('');
    lines.push(`\`${item.id}\`${item.weight != null ? ` · weight ${item.weight}` : ''}`);
    lines.push('');
    lines.push(quoteBlock(item.quote));
    lines.push('');
    if ((item.signals ?? []).length > 0) {
      lines.push('What this rewards:');
      lines.push('');
      for (const s of item.signals) lines.push(bullet(s));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '`evidence_slots` on each criterion is filled later by `:check` and `:review` with '
    + '`file:line` citations. A claim without a citation is unverified.',
  );

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderCriteriaMap(recon) {
  const c = recon.criteria ?? {};
  const items = byRank(c.items);
  const lines = [];

  lines.push('| # | Criterion | What the host asks | How this project wins it |');
  lines.push('|---|---|---|---|');
  for (const item of items) {
    const marker = item.rank === 1 && c.tiebreak === 'listed_order' ? ` ${TIEBREAK_MARKER}` : '';
    lines.push(`| ${item.rank} | **${cell(item.name)}**${marker} | ${cell(item.quote)} | _to be written_ |`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderRules(recon) {
  const lines = [];
  lines.push(`# Rules that bind us — ${recon.identity?.name ?? 'Hackathon'}`);
  lines.push('');
  lines.push('Extracted verbatim. Where this file and the hackathon site disagree, the site wins.');
  lines.push('');

  const hard = (recon.submission_requirements ?? []).filter((r) => r.hard);
  const soft = (recon.submission_requirements ?? []).filter((r) => !r.hard);
  if (hard.length > 0) {
    lines.push('## Hard submission requirements');
    lines.push('');
    lines.push('Every one of these is a disqualifier if missing.');
    lines.push('');
    for (const r of hard) {
      lines.push(`### \`${r.id}\``);
      lines.push('');
      lines.push(r.requirement);
      lines.push('');
      if (r.quote) {
        lines.push(quoteBlock(r.quote));
        lines.push('');
      }
    }
  }
  if (soft.length > 0) {
    lines.push('## Optional submission elements');
    lines.push('');
    for (const r of soft) lines.push(bullet(`\`${r.id}\` — ${r.requirement}`));
    lines.push('');
  }

  const constraints = recon.constraints ?? [];
  if (constraints.length > 0) {
    lines.push('## Constraints on how we build');
    lines.push('');
    for (const c of constraints) {
      lines.push(`### \`${c.id}\``);
      lines.push('');
      lines.push(c.constraint);
      lines.push('');
      if (c.implication) {
        lines.push(`**What this means for us:** ${c.implication}`);
        lines.push('');
      }
      if (c.quote) {
        lines.push(quoteBlock(c.quote));
        lines.push('');
      }
    }
  }

  const el = recon.eligibility;
  if (el) {
    lines.push('## Eligibility');
    lines.push('');
    if ((el.excluded_regions ?? []).length > 0) {
      lines.push(`**Excluded regions:** ${el.excluded_regions.join(', ')}.`);
      lines.push('');
      lines.push('Check this against your own residence before spending a single hour.');
      lines.push('');
    }
    for (const n of el.notes ?? []) lines.push(bullet(n));
    if ((el.notes ?? []).length > 0) lines.push('');
    if (el.quote) {
      lines.push(quoteBlock(el.quote));
      lines.push('');
    }
  }

  const guidance = recon.host_guidance ?? [];
  if (guidance.length > 0) {
    lines.push('## Host guidance');
    lines.push('');
    lines.push('The host telling us how they will read our work. Treat as scoring instructions.');
    lines.push('');
    for (const g of guidance) {
      lines.push(`### ${g.topic}${g.source ? ` — ${g.source}` : ''}`);
      lines.push('');
      lines.push(g.guidance);
      lines.push('');
    }
  }

  const amb = recon.ambiguities ?? [];
  if (amb.length > 0) {
    lines.push('## Ambiguities in the rules');
    lines.push('');
    for (const a of amb) {
      lines.push(`### ${a.where}`);
      lines.push('');
      lines.push(bullet(`**Issue:** ${a.issue}`));
      if (a.likely_reading) lines.push(bullet(`**Likely reading:** ${a.likely_reading}`));
      if (a.remedy) lines.push(bullet(`**Remedy:** ${a.remedy}`));
      lines.push('');
    }
  }

  const form = recon.submission_form;
  if (form) {
    lines.push('## Submission form');
    lines.push('');
    for (const f of form.fields ?? []) {
      const limit = f.limit != null ? ` — max ${f.limit} ${f.unit ?? 'characters'}` : '';
      lines.push(bullet(`\`${f.id}\`${limit}`));
      for (const h of f.default_headings ?? []) lines.push(`  - ${h}`);
    }
    if (form.gallery) {
      const g = form.gallery;
      lines.push(bullet(
        `Gallery — up to ${g.max_images ?? '?'} images, ${g.ratio ?? '?'}, ${g.max_mb ?? '?'} MB each`,
      ));
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderIdeas(doc, recon) {
  const items = [...(doc.ideas ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const out = [];

  out.push(`# Ideas — round ${doc.round ?? 1}`);
  out.push('');
  if (recon?.identity?.name) out.push(`For **${recon.identity.name}**.`);
  out.push(
    'Every idea below cleared the Stage-One gate before it was scored. '
    + 'Ideas that failed the gate are listed at the end, with reasons and no numbers.',
  );
  out.push('');

  if (items.length === 0) {
    out.push('## Shortlist');
    out.push('');
    out.push('**No idea survived the Stage-One gate this round.** That is a real result, not a failure of the run — see the disqualified list below and start a fresh round with `--fresh`.');
    out.push('');
  } else {
    out.push('## Shortlist');
    out.push('');
    for (const idea of items) {
      const tech = idea.primary_tech ? ` · ${idea.primary_tech}` : '';
      out.push(`${idea.rank}. **${idea.name}** — ${idea.pitch} · ${idea.track?.id ?? 'no track'}${tech}`);
    }
    out.push('');

    out.push('## The ideas in full');
    out.push('');
    for (const idea of items) {
      out.push(`### ${idea.rank}. ${idea.name}`);
      out.push('');
      out.push(`*${idea.pitch}*`);
      out.push('');
      out.push(`- **Thesis** — ${idea.thesis}`);
      out.push(`- **Inversion** — ${idea.inversion}`);
      out.push(`- **Demo moment** — ${idea.demo_moment}`);
      out.push(`- **Track** — \`${idea.track?.id ?? '?'}\`${idea.track?.ev_note ? ` — ${idea.track.ev_note}` : ''}`);
      if (idea.angle) out.push(`- **Angle** — ${idea.angle}`);
      if (idea.feasibility_hours != null) out.push(`- **Feasibility** — ~${idea.feasibility_hours}h`);
      out.push('');
      out.push('| Criterion | Score | Why |');
      out.push('|---|---|---|');
      for (const s of idea.scores ?? []) {
        const name = (recon?.criteria?.items ?? []).find((c) => c.id === s.criterion_id)?.name
          ?? s.criterion_id;
        out.push(`| ${cell(name)} | ${s.score} | ${cell(s.rationale)} |`);
      }
      if (idea.total != null) {
        const max = recon?.criteria?.max_base_score;
        out.push(`| **Total** | **${idea.total}${max ? ` / ${max}` : ''}** | |`);
      }
      out.push('');
    }
  }

  const rejected = doc.disqualified ?? [];
  if (rejected.length > 0) {
    out.push('## Disqualified at Stage One');
    out.push('');
    out.push('Not scored. A number on a non-compliant idea only makes it harder to let go of.');
    out.push('');
    for (const idea of rejected) {
      out.push(`### ${idea.name}`);
      out.push('');
      if (idea.pitch) {
        out.push(`*${idea.pitch}*`);
        out.push('');
      }
      for (const r of idea.stage_one?.reasons ?? []) out.push(`- ${r}`);
      out.push('');
    }
  }

  return `${out.join('\n').trimEnd()}\n`;
}
