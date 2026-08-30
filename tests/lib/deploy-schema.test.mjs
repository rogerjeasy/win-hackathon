import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDeploy, DEPLOY_SCHEMA_VERSION, AUTH_KINDS } from '../../scripts/lib/deploy-schema.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}
const golden = () => fixture('h0-deploy.json');
const stack = () => fixture('h0-stack.json');

test('the golden fixture validates', async () => {
  const { valid, errors } = validateDeploy(await golden(), await stack());
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('never throws on malformed input', () => {
  for (const bad of [null, undefined, 'nope', 42, []]) {
    assert.doesNotThrow(() => validateDeploy(bad));
    assert.equal(validateDeploy(bad).valid, false);
  }
});

test('verified: true requires verified_at and verification_method', async () => {
  const d = await golden();
  d.services[0].verified_at = null;
  const { valid, errors } = validateDeploy(d, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /verified_at/.test(e)));
});

test('a deployable stack slot with no matching service is an error', async () => {
  const d = await golden();
  d.services = [];
  const { valid, errors } = validateDeploy(d, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /has no matching service/i.test(e)));
});

test('auth "static-secret" is valid but only WIF/OIDC pass without a warning', async () => {
  const d = await golden();
  d.cicd.auth = 'static-secret';
  const { valid, warnings } = validateDeploy(d, await stack());
  assert.equal(valid, true);
  assert.ok(warnings.some((w) => /static-secret is a fallback/i.test(w)));
});
