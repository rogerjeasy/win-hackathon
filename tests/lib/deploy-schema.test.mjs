import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDeploy, AUTH_KINDS } from '../../scripts/lib/deploy-schema.mjs';

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

test('a slot id where a keyword is embedded inside a larger unbroken word (not its own segment) is still deployable, not silently excluded', () => {
  // "recache-service" and "dequeue-worker" each contain "cache"/"queue" as a *substring*
  // of a longer segment ("recache", "dequeue") but not as their own delimited segment --
  // exactly the class of false negative the unanchored regex used to produce.
  const fakeStack = { slots: [{ id: 'recache-service' }, { id: 'dequeue-worker' }] };
  const deploy = { target_strategy: 'vercel', services: [], cicd: { auth: 'wif' } };
  const { errors } = validateDeploy(deploy, fakeStack);
  assert.ok(errors.some((e) => /stack slot "recache-service" has no matching service/i.test(e)),
    'recache-service is a real deployable and should still require a matching service');
  assert.ok(errors.some((e) => /stack slot "dequeue-worker" has no matching service/i.test(e)),
    'dequeue-worker is a real deployable and should still require a matching service');
});

test('a slot id that is exactly (or has a segment exactly equal to) a non-deployable word is still excluded', () => {
  const fakeStack = {
    slots: [
      { id: 'database' },
      { id: 'job-queue' },
      { id: 'edge-cache' },
      { id: 'frontend' },
    ],
  };
  const deploy = {
    target_strategy: 'vercel',
    services: [{
      name: 'frontend', kind: 'frontend', target: 'vercel', url: 'https://f.example.com',
      verified: true, verified_at: '2026-08-30T20:00:00Z', verification_method: 'curl -sf (exit 0)',
    }],
    cicd: { auth: 'wif' },
  };
  const { valid, errors } = validateDeploy(deploy, fakeStack);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test('a service missing url is an error', async () => {
  const d = await golden();
  delete d.services[0].url;
  const { valid, errors } = validateDeploy(d, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /services\[0\]\.url must be a non-empty string/.test(e)));
});

test('a service with verified: false is an error -- an unverified deploy is not shipped', async () => {
  const d = await golden();
  d.services[0].verified = false;
  const { valid, errors } = validateDeploy(d, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /services\[0\] is not verified/.test(e)));
});

test('a service missing verified entirely is an error, same as verified: false', async () => {
  const d = await golden();
  delete d.services[0].verified;
  const { valid, errors } = validateDeploy(d, await stack());
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /services\[0\] is not verified/.test(e)));
});

test('h0-stack.json: only the database slot is excluded -- deploy and frontend still require a matching service', async () => {
  const s = await stack();
  const d = await golden();
  d.services = [];
  const { errors } = validateDeploy(d, s);
  assert.ok(errors.some((e) => /stack slot "frontend" has no matching service/.test(e)));
  assert.ok(errors.some((e) => /stack slot "deploy" has no matching service/.test(e)));
  assert.ok(!errors.some((e) => /stack slot "database" has no matching service/.test(e)));
});
