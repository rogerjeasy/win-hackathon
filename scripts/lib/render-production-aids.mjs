/**
 * Two production aids -- neither judge-facing, so both stay in .hackathon/
 * (docs/design/m5-design.md §1). Simple shot-list renders; the content discipline
 * (sub-three-minute cap, criterion mapping) lives in submission-schema.mjs and the
 * demo-video-script/devpost-submission skills, not here.
 */
export function renderVideoScript(submission) {
  const v = submission.video_script;
  const lines = ['# Video Script', ''];
  lines.push(`Total: ${v.total_seconds}s (cap: 180s).`, '');
  lines.push('| Shot | Seconds | Script | On screen |', '|---|---|---|---|');
  for (const s of v.shots) {
    lines.push(`| ${s.label} | ${s.seconds} | ${s.script} | ${s.on_screen} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderScreenshots(submission) {
  const lines = ['# Screenshot Shot List', ''];
  lines.push('| ID | Criterion | Instructions |', '|---|---|---|');
  for (const s of submission.screenshots.shots) {
    lines.push(`| ${s.id} | ${s.criterion_ref} | ${s.instructions} |`);
  }
  lines.push('');
  return lines.join('\n');
}
