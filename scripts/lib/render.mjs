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
