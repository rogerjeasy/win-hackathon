const SEVERITY_ORDER = ['blocking', 'should-fix', 'post-hackathon'];
const SEVERITY_LABEL = {
  blocking: 'Blocking', 'should-fix': 'Should-fix', 'post-hackathon': 'Post-hackathon',
};

/** Renders review.json to review.md -- blocking first, then by judge_visible within each
 * bucket, never by file path (docs/design/m5-design.md §3). */
export function renderReview(review) {
  const findings = review.findings ?? [];
  const lines = ['# Review', ''];
  if (findings.length === 0) {
    lines.push('No findings. Clean.', '');
    return lines.join('\n');
  }
  for (const severity of SEVERITY_ORDER) {
    const bucket = findings
      .filter((f) => f.severity === severity)
      .sort((a, b) => Number(b.judge_visible) - Number(a.judge_visible) || a.id.localeCompare(b.id));
    if (bucket.length === 0) continue;
    lines.push(`## ${SEVERITY_LABEL[severity]}`, '');
    for (const f of bucket) {
      const loc = f.file ? ` (\`${f.file}${f.line != null ? `:${f.line}` : ''}\`)` : '';
      lines.push(`### ${f.id} — ${f.title}${loc}`, '');
      lines.push(`_source: ${f.source}${f.judge_visible ? ', judge-visible' : ''}_`, '');
      lines.push(f.summary, '');
    }
  }
  return lines.join('\n');
}
