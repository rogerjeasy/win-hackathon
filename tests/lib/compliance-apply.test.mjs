import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateComplianceReport, applyCompliance } from '../../scripts/lib/compliance-apply.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('validateComplianceReport accepts the golden fixture', async () => {
  const { valid, errors } = validateComplianceReport(await fixture('h0-compliance-result.json'));
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('validateComplianceReport rejects a non-boolean used flag', async () => {
  const report = await fixture('h0-compliance-result.json');
  report.required_tech_verified['aws-bedrock'].used = 'yes';
  const { valid, errors } = validateComplianceReport(report);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /used must be a boolean/.test(e)));
});

test('applyCompliance overwrites required_tech_verified as flat booleans and never persists evidence', async () => {
  await withTmpDir(async (root) => {
    const state = createDefaultState({ pluginVersion: '0.1.0' });
    state.compliance.required_tech_verified = { 'aws-bedrock': false, 'stale-entry': true };
    await writeState(root, state);
    const report = await fixture('h0-compliance-result.json');
    const now = new Date('2026-08-30T10:00:00Z');
    const result = await applyCompliance(root, report, { now });

    const next = await readState(root);
    assert.deepEqual(next.compliance.required_tech_verified, { 'aws-bedrock': true, 'aurora-pgvector': false });
    assert.equal('stale-entry' in next.compliance.required_tech_verified, false,
      'a run must overwrite, not merge -- a slot the report no longer mentions must not survive');
    assert.equal(next.compliance.last_checked, '2026-08-30T10:00:00.000Z');
    assert.deepEqual(result.outstanding, ['aurora-pgvector']);
  });
});

test('applyCompliance surfaces forbidden tech found', async () => {
  await withTmpDir(async (root) => {
    await writeState(root, createDefaultState({ pluginVersion: '0.1.0' }));
    const report = await fixture('h0-compliance-result.json');
    report.forbidden_tech_found = ['DynamoDB'];
    const result = await applyCompliance(root, report);
    assert.deepEqual(result.forbiddenFound, ['DynamoDB']);
  });
});

test('applyCompliance throws a readable error given an invalid report, without touching state', async () => {
  await withTmpDir(async (root) => {
    const before = createDefaultState({ pluginVersion: '0.1.0' });
    await writeState(root, before);
    await assert.rejects(() => applyCompliance(root, { required_tech_verified: 'nope' }), /refusing to apply/);
    const after = await readState(root);
    assert.deepEqual(after, before);
  });
});

test('validateComplianceReport rejects used: true with evidence omitted (regression)', async () => {
  const report = {
    required_tech_verified: { x: { used: true } },
    forbidden_tech_found: [],
  };
  const { valid, errors } = validateComplianceReport(report);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /marked used with no evidence/.test(e)));
});

test('validateComplianceReport rejects used: true with evidence as non-string (regression)', async () => {
  const report = {
    required_tech_verified: { x: { used: true, evidence: 42 } },
    forbidden_tech_found: [],
  };
  const { valid, errors } = validateComplianceReport(report);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /evidence must be a string or null/.test(e)));
});
