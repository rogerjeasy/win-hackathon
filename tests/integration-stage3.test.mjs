import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withTmpDir } from './helpers/tmp.mjs';
import { mustHaveFeatures, nextFeature } from '../scripts/lib/build-apply.mjs';
import { applyCompliance } from '../scripts/lib/compliance-apply.mjs';
import { readState } from '../scripts/lib/state.mjs';
import { scaffoldStage2Project } from './helpers/scaffold.mjs';

test('Stage 1 milestone: every must-have feature reaches done, then :check overwrites clean', async () => {
  await withTmpDir(async (root) => {
    const requirements = await scaffoldStage2Project(root); // returns the requirements.json it wrote
    for (const feature of mustHaveFeatures(requirements)) {
      const dir = path.join(root, '.hackathon', 'specs', feature.dir);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'tasks.md'), '- [x] step one\n- [x] step two\n', 'utf8');
    }
    assert.equal(await nextFeature(root, requirements, []), null);

    const state = await readState(root);
    const requiredRefs = Object.keys(state.compliance.required_tech_verified);
    const report = {
      required_tech_verified: Object.fromEntries(
        requiredRefs.map((ref) => [ref, { used: true, evidence: 'src/app.ts:1' }]),
      ),
      forbidden_tech_found: [],
    };
    const result = await applyCompliance(root, report);
    assert.deepEqual(result.outstanding, []);
    assert.deepEqual(result.forbiddenFound, []);
  });
});

test('Stage 1 milestone: a cut feature is skipped by nextFeature without touching requirements.json', async () => {
  await withTmpDir(async (root) => {
    const requirements = await scaffoldStage2Project(root);
    const before = JSON.stringify(requirements);
    const cutId = requirements.features.find((f) => f.priority === 'must').requirements[0].id;
    const musts = mustHaveFeatures(requirements, [cutId]);
    assert.equal(musts.length, mustHaveFeatures(requirements).length - 1);
    assert.equal(JSON.stringify(requirements), before, 'requirements.json must never be mutated');
  });
});
