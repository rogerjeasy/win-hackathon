import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  mustHaveFeatures, parseTasksProgress, featureDone, nextFeature, buildContextBundle,
} from '../../scripts/lib/build-apply.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

test('mustHaveFeatures filters to must-priority, preserves array order, and numbers like emit-kiro.mjs', async () => {
  const requirements = await fixture('h0-requirements.json');
  const musts = requirements.features.filter((f) => f.priority === 'must');
  const result = mustHaveFeatures(requirements);
  assert.equal(result.length, musts.length);
  result.forEach((f, i) => {
    assert.equal(f.slug, musts[i].slug);
    assert.equal(f.dir, `${String(i + 1).padStart(4, '0')}-${musts[i].slug}`);
  });
});

test('mustHaveFeatures excludes FR-ids present in cutFeatures', async () => {
  const requirements = await fixture('h0-requirements.json');
  const musts = mustHaveFeatures(requirements);
  const someFrId = requirements.features.find((f) => f.priority === 'must').requirements[0].id;
  const cut = mustHaveFeatures(requirements, [someFrId]);
  assert.equal(cut.length, musts.length - 1);
  // The core guarantee: cutting a feature must never renumber its neighbors' dir.
  for (const survivor of cut) {
    const uncut = musts.find((f) => f.slug === survivor.slug);
    assert.equal(survivor.dir, uncut.dir, `${survivor.slug}'s dir must not shift when an earlier feature is cut`);
  }
});

test('parseTasksProgress counts checkbox lines and reports done only when all are checked', () => {
  const partial = '1. **FR-01.1**\n   - [x] step one\n   - [ ] step two\n';
  assert.deepEqual(parseTasksProgress(partial), { total: 2, checked: 1, done: false });

  const full = '1. **FR-01.1**\n   - [x] step one\n   - [X] step two\n';
  assert.deepEqual(parseTasksProgress(full), { total: 2, checked: 2, done: true });

  assert.deepEqual(parseTasksProgress(''), { total: 0, checked: 0, done: false });
});

test('featureDone reads tasks.md off disk and returns false when the file does not exist', async () => {
  await withTmpDir(async (root) => {
    const dir = path.join(root, '.hackathon', 'specs', '0001-demo-feature');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'tasks.md'), '- [x] a\n- [x] b\n', 'utf8');
    assert.equal(await featureDone(root, '0001-demo-feature'), true);
    assert.equal(await featureDone(root, '0002-missing'), false);
  });
});

test('nextFeature returns the first not-done must-have feature in order, or null when all are done', async () => {
  const requirements = await fixture('h0-requirements.json');
  await withTmpDir(async (root) => {
    const musts = mustHaveFeatures(requirements);
    for (const f of musts) {
      const dir = path.join(root, '.hackathon', 'specs', f.dir);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'tasks.md'), '- [x] done\n', 'utf8');
    }
    // Un-finish the second feature so it's the one nextFeature should surface.
    if (musts.length > 1) {
      await writeFile(
        path.join(root, '.hackathon', 'specs', musts[1].dir, 'tasks.md'),
        '- [ ] not done\n', 'utf8',
      );
      const next = await nextFeature(root, requirements, []);
      assert.equal(next.feature.slug, musts[1].slug);
      assert.equal(next.done, false);
    } else {
      assert.equal(await nextFeature(root, requirements, []), null);
    }
  });
});

test('nextFeature honors an explicit --feature FR-id override', async () => {
  const requirements = await fixture('h0-requirements.json');
  const target = requirements.features.find((f) => f.priority === 'must');
  const result = await withTmpDir((root) => nextFeature(root, requirements, [], { featureId: target.requirements[0].id }));
  assert.equal(result.feature.slug, target.slug);
});

test('buildContextBundle reads all five inputs and degrades missing ones to null', async () => {
  const requirements = await fixture('h0-requirements.json');
  const feature = mustHaveFeatures(requirements)[0];
  await withTmpDir(async (root) => {
    const specDir = path.join(root, '.hackathon', 'specs', feature.dir);
    await mkdir(specDir, { recursive: true });
    await writeFile(path.join(specDir, 'design.md'), '# design', 'utf8');
    await writeFile(path.join(specDir, 'requirements.md'), '# reqs', 'utf8');
    const bundle = await buildContextBundle(root, feature);
    assert.equal(bundle.designMd, '# design');
    assert.equal(bundle.requirementsMd, '# reqs');
    assert.equal(bundle.gherkin, null);
    assert.equal(bundle.agentsMd, null);
    assert.equal(bundle.stackMd, null);
  });
});
