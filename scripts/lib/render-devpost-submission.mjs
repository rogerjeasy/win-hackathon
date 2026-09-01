/**
 * .hackathon/submission.md -- organized by the platform's own form steps, not this
 * plugin's own headings (docs/design/m5-design.md §8, kintwadi's real working-doc
 * precedent: "Master working doc for the Devpost submission form. Fill each form step
 * from the matching section below.").
 */
export function renderDevpostSubmission(submission) {
  const form = submission.devpost_form;
  const lines = ['# Devpost Submission', ''];
  lines.push('Master working doc for the Devpost submission form. Fill each form field', 'from the matching section below.', '');

  lines.push('## Form fields', '');
  for (const f of form.fields) {
    lines.push(`### \`${f.id}\``, '', '```', f.text, '```', '');
  }

  lines.push('## Challenges we ran into', '', form.challenges, '');

  lines.push('## Submission requirements tracker', '');
  for (const r of form.requirements_tracker) {
    const box = r.status === 'done' || r.status === 'skipped' ? 'x' : ' ';
    const note = r.status === 'skipped' ? ' _(skipped -- see decisions.md)_' : '';
    lines.push(`- [${box}] \`${r.id}\` — ${r.requirement}${note}`);
  }
  lines.push('');

  if (form.bonus_tracker.length > 0) {
    lines.push('## Bonus content tracker', '');
    for (const b of form.bonus_tracker) {
      const box = b.status === 'done' ? 'x' : ' ';
      const link = b.url ? ` — ${b.url}` : '';
      lines.push(`- [${box}] \`${b.id}\` (${b.kind} on ${b.platform ?? 'TBD platform'})${link}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
