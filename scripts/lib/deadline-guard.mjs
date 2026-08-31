import { remainingHours } from './pivot-apply.mjs';

export function computeDeadlinePressure(state, { now = new Date() } = {}) {
  const totalHours = state.budget?.total_hours;
  const hours = remainingHours(state, { now });

  if (hours !== null && totalHours) {
    if (hours < 0.25 * totalHours) {
      return {
        warn: true,
        message: `~${hours.toFixed(1)}h remain, under 25% of the ${totalHours}h budget. Consider /win-hackathon:pivot.`,
      };
    }
  }

  for (const [name, phase] of Object.entries(state.phases ?? {})) {
    if (phase?.status !== 'in_progress' || !phase.started_at) continue;
    const budgeted = state.budget?.phase_budget?.[name];
    if (!budgeted) continue;
    const elapsed = (now.getTime() - Date.parse(phase.started_at)) / 3_600_000;
    if (elapsed > budgeted) {
      return {
        warn: true,
        message: `Phase "${name}" has run ${elapsed.toFixed(1)}h against a ${budgeted}h budget. Consider /win-hackathon:pivot.`,
      };
    }
  }

  return { warn: false, message: null };
}
