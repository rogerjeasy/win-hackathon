import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExplicitOffset } from '../../scripts/lib/iso-datetime.mjs';

test('accepts an offset timestamp', () => {
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00-07:00'), true);
});

test('accepts a Z timestamp', () => {
  assert.equal(hasExplicitOffset('2026-06-30T00:00:00Z'), true);
});

test('accepts minute precision and fractional seconds', () => {
  assert.equal(hasExplicitOffset('2026-06-29T17:00-07:00'), true);
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00.500Z'), true);
});

test('rejects a floating time with no offset', () => {
  // The killer bug: "Jun 30 @ 2:00am GMT+2" and "Jun 29 5:00pm PT" are the same
  // instant. A timestamp without an offset silently means "whatever zone the
  // machine happens to be in", which is how a deadline gets missed.
  assert.equal(hasExplicitOffset('2026-06-29T17:00:00'), false);
});

test('rejects a date with no time', () => {
  assert.equal(hasExplicitOffset('2026-06-29'), false);
});

test('rejects prose, empty strings, and non-strings', () => {
  assert.equal(hasExplicitOffset('June 29, 2026 5:00pm PT'), false);
  assert.equal(hasExplicitOffset(''), false);
  assert.equal(hasExplicitOffset(null), false);
  assert.equal(hasExplicitOffset(undefined), false);
  assert.equal(hasExplicitOffset(1750000000000), false);
});

test('rejects a well-formed but impossible date', () => {
  assert.equal(hasExplicitOffset('2026-02-30T10:00:00Z'), false);
});
