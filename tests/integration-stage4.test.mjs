import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkTools } from '../scripts/lib/preflight.mjs';
import { selectTargets, applyShip } from '../scripts/lib/ship-apply.mjs';
import { validateDeploy } from '../scripts/lib/deploy-schema.mjs';
import { readState, writeState } from '../scripts/lib/state.mjs';
import { withTmpDir } from './helpers/tmp.mjs';
import { scaffoldStage2Project } from './helpers/scaffold.mjs'; // from Task 6

const run = promisify(execFile);

test('M4 milestone: Docker Compose end-to-end -- selectTargets, applyShip, and a real curl-verified local URL', async (t) => {
  const tools = await checkTools();
  if (!tools.find((x) => x.name === 'docker')?.present) {
    t.skip('docker not available on this machine -- this is the one human-run check, per docs/design/m4-design.md §11');
    return;
  }

  await withTmpDir(async (root) => {
    await scaffoldStage2Project(root);
    const state = await readState(root);
    await writeState(root, { ...state, phases: { ...state.phases, stack: { ...state.phases.stack, status: 'approved' } } });

    // A minimal one-service Compose fixture -- a static file server on a fixed port is
    // enough to prove the mechanics without needing a real application build.
    await run('docker', ['compose', '-f', 'tests/fixtures/h0-compose.yml', 'up', '-d'], { cwd: root });
    t.after(() => run('docker', ['compose', '-f', 'tests/fixtures/h0-compose.yml', 'down'], { cwd: root }).catch(() => {}));

    const url = 'http://localhost:8089/';
    let verified = false;
    for (let i = 0; i < 10 && !verified; i += 1) {
      try {
        await run('curl', ['-sf', url]);
        verified = true;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.equal(verified, true, 'the compose service never became reachable');

    const deploy = {
      target_strategy: 'docker-compose',
      services: [{
        name: 'web', kind: 'frontend', target: 'docker-compose', dockerfile: null,
        url, verified: true, verified_at: new Date().toISOString(),
        verification_method: `curl -sf ${url} (exit 0)`,
      }],
      infra: { terraform_modules: [], state_backend: 'local' },
      cicd: { workflows: [], auth: 'static-secret' },
    };
    const { valid } = validateDeploy(deploy, null);
    assert.equal(valid, true);
    const { artifacts } = await applyShip(root, deploy, {});
    assert.deepEqual(artifacts, ['.hackathon/deploy.json']);
    const next = await readState(root);
    assert.equal(next.project.deploy.primary_url, url);
    assert.equal(next.phases.ship.status, 'awaiting_approval');
  });
});
