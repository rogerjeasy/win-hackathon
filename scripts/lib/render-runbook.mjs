/**
 * docs/DEMO_RUNBOOK.md (docs/design/m5-design.md §8): Judge Quick-Start as its own top
 * section before the slower Full Manual Walkthrough, a Troubleshooting table, the reset
 * procedure.
 */
export function renderRunbook(submission) {
  const r = submission.runbook;
  const lines = [];
  lines.push('# Demo Runbook', '');
  lines.push(`Expected duration: ~${r.expected_duration_minutes} minutes from cold start.`, '');
  lines.push('## Prerequisites', '');
  for (const p of r.prerequisites) lines.push(`- ${p}`);
  lines.push('');
  lines.push('## Judge Quick-Start (no account required)', '');
  r.quick_start_steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push('');
  lines.push('## Full Manual Walkthrough', '');
  for (const step of r.manual_walkthrough) {
    lines.push(`### Step ${step.step}`, '', step.instructions, '', `Expected: ${step.expected}`, '');
  }
  lines.push('## Troubleshooting', '');
  lines.push('| Symptom | Fix |', '|---|---|');
  for (const t of r.troubleshooting) lines.push(`| ${t.symptom} | ${t.fix} |`);
  lines.push('');
  lines.push('## Reset', '', `\`${r.reset_procedure}\``, '');
  return lines.join('\n');
}
