import { PHASES } from './paths.mjs';

const SYMBOL = {
  approved: '[x]', in_progress: '[~]', awaiting_approval: '[!]',
  skipped: '[-]', not_started: '[ ]',
};

export function renderStatusBoard({ state, resolution, tools }) {
  const lines = [];
  const name = state.project?.name ?? state.hackathon?.name ?? '(unnamed project)';
  lines.push(`win-hackathon — ${name}`);

  if (resolution.outcome === 'drift') {
    lines.push('');
    lines.push('!! DRIFT — state disagrees with the filesystem:');
    for (const d of resolution.drift) {
      lines.push(`   ${d.phase}: missing ${d.missing.join(', ')}`);
    }
  }

  lines.push('');
  for (const p of PHASES) {
    const status = state.phases[p]?.status ?? 'not_started';
    const marker = p === resolution.phase ? ' <- next' : '';
    lines.push(`${SYMBOL[status] ?? '[ ]'} ${p.padEnd(13)} ${status}${marker}`);
  }

  if (state.budget?.total_hours) {
    const left = state.budget.total_hours - (state.budget.spent_hours ?? 0);
    lines.push('');
    lines.push(`Time: ${left}h remaining of ${state.budget.total_hours}h`);
  }

  if (state.hackathon?.selected_track) {
    lines.push('');
    lines.push(`Track: ${state.hackathon.selected_track}`);
  }

  const stack = state.project?.stack;
  if (stack?.repo_shape) {
    lines.push('');
    lines.push(`Stack: ${stack.repo_shape}${stack.primary_database ? ` · ${stack.primary_database}` : ''}`);
  }

  // state.json stores only the ref, not a copy of the payload — :architect writes no
  // summary object onto project the way :stack does — so presence of the ref is all the
  // board can report on without reading architecture.json off disk.
  if (state.project?.architecture_ref) {
    lines.push('');
    lines.push('Architecture: designed — see docs/architecture.md');
  }

  // Only the unverified ones. A board that lists everything verified is a board nobody reads.
  const verified = state.compliance?.required_tech_verified ?? {};
  const outstanding = Object.entries(verified).filter(([, ok]) => !ok).map(([id]) => id);
  if (outstanding.length > 0) {
    lines.push('');
    lines.push('Required tech not yet verified');
    for (const id of outstanding) lines.push(`  [ ] ${id}`);
  }

  const forbiddenFound = state.compliance?.forbidden_tech_found ?? [];
  if (forbiddenFound.length > 0) {
    lines.push('');
    lines.push('Forbidden technology found');
    for (const id of forbiddenFound) lines.push(`  ! ${id}`);
  }

  const cutFeatures = state.project?.cut_features ?? [];
  if (cutFeatures.length > 0) {
    lines.push('');
    lines.push('Cut under :pivot');
    for (const id of cutFeatures) lines.push(`  - ${id}`);
  }

  // An action deadline closes before the work is due — missing it costs a resource,
  // not the hackathon, which is exactly why it is easy to forget.
  const action = state.hackathon?.next_action_deadline;
  if (action?.at) {
    // validateState only requires `.at` to be a well-formed offset date; a hand-edited
    // state.json can still have a next_action_deadline with no `.label`. Guard it so a
    // missing label prints as a plain fallback, not the literal string "undefined".
    lines.push('');
    lines.push(`Next action deadline: ${action.at} — ${action.label ?? 'unlabeled action deadline'}`);
  }

  const reqs = state.deliverables?.submission_requirements ?? [];
  const bonusItems = state.deliverables?.bonus_content ?? [];
  const openReqs = reqs.filter((d) => d.status !== 'done' && d.status !== 'skipped');
  const doneReqs = reqs.filter((d) => d.status === 'done');
  const skippedReqs = reqs.filter((d) => d.status === 'skipped');
  const openBonus = bonusItems.filter((d) => d.status !== 'done' && d.status !== 'skipped');

  if (reqs.length > 0 || bonusItems.length > 0) {
    lines.push('');
    lines.push('Deliverables');
    if (reqs.length > 0) {
      // Count only items whose status is actually "done" -- lumping "skipped" in with
      // "done" here would report e.g. "2 of 2 done" when one was merely skipped, telling
      // the user everything is finished when a required submission item was not.
      lines.push(`  submission requirements: ${doneReqs.length} of ${reqs.length} done` +
        (skippedReqs.length > 0 ? ` (${skippedReqs.length} skipped)` : ''));
      for (const d of openReqs) lines.push(`    [ ] ${d.id}`);
    }
    if (openBonus.length > 0) {
      const points = state.hackathon?.bonus_points_available ?? 0;
      lines.push(`  bonus content: ${openBonus.length} unpublished — up to +${points} unclaimed`);
    }
  }

  const missing = (tools ?? []).filter((t) => !t.present);
  if (missing.length > 0) {
    lines.push('');
    lines.push('Missing tools');
    for (const t of missing) {
      lines.push(`  ${t.name} — needed for ${t.needate}${t.blocking ? ' (blocking)' : ''}`);
    }
  }

  lines.push('');
  lines.push(resolution.reason);
  return lines.join('\n');
}

export function renderInitPlan(plan) {
  const lines = [];
  lines.push(`Init plan — mode: ${plan.env.mode} (scenarios: ${plan.env.scenarios.join(', ')})`);
  lines.push('');

  const free = plan.actions.filter((a) => !a.needsConsent);
  const gated = plan.actions.filter((a) => a.needsConsent);

  if (free.length > 0) {
    lines.push('Will be created (nothing pre-existing is touched):');
    for (const a of free) lines.push(`  ${a.kind.padEnd(13)} ${a.path} — ${a.reason}`);
  }
  if (gated.length > 0) {
    lines.push('');
    lines.push('Needs your approval (each is asked separately):');
    for (const a of gated) lines.push(`  ${a.kind.padEnd(13)} ${a.path} — ${a.reason}`);
  }
  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of plan.warnings) lines.push(`  ${w}`);
  }
  return lines.join('\n');
}

/** A Markdown table. Empty rows render as nothing — a header with no data is noise. */
export function renderTable(headers, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const cell = (v) => (v === null || v === undefined ? '—' : String(v).replace(/\|/g, '\\|'));
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}
