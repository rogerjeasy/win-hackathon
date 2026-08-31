export function computeSpentHours(state, { now = new Date(), sha } = {}) {
  const startedAt = state.hackathon?.started_at;
  if (!startedAt) {
    return { spent_hours: state.budget?.spent_hours ?? 0, last_commit: state.budget?.last_commit ?? null };
  }
  const spent_hours = (now.getTime() - Date.parse(startedAt)) / 3_600_000;
  return { spent_hours, last_commit: { at: now.toISOString(), sha } };
}
