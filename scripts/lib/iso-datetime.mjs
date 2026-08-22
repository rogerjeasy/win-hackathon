// An ISO 8601 timestamp with an explicit UTC offset. The offset is the point: a
// hackathon deadline written without one means "whatever zone this machine is in",
// which is how a submission gets missed by a day.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function hasExplicitOffset(value) {
  if (typeof value !== 'string') return false;
  if (!ISO_WITH_OFFSET.test(value)) return false;
  // The regex accepts 2026-02-30, and V8's Date.parse doesn't reject it either — it
  // silently rolls over to 2026-03-02 instead of returning NaN. So the calendar fields
  // have to be checked by hand: build a UTC date from the year/month/day substrings and
  // confirm nothing rolled over.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    asUtc.getUTCFullYear() !== year
    || asUtc.getUTCMonth() !== month - 1
    || asUtc.getUTCDate() !== day
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}
