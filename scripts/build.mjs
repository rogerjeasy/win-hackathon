#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mustHaveFeatures, nextFeature, buildContextBundle } from './lib/build-apply.mjs';
import { readState, writeState, migrateStateFile } from './lib/state.mjs';
import { requirementsPath, specsDir } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const idx = rest.indexOf('--feature');
const featureId = idx === -1 ? undefined : rest[idx + 1];

function usage() {
  console.error('usage: build.mjs status <project-root> [--feature <FR-id>]');
  console.error('       build.mjs gate <project-root>');
  process.exit(2);
}

// nextFeature(..., { featureId }) returns null both when every must-have feature is
// genuinely done AND when featureId doesn't resolve to any kept must-have feature (a
// typo, or an FR-id whose feature got cut) -- see build-apply.mjs. status must not
// conflate those into the same "everything done" message, or a stale --feature flag
// would send the calling agent straight past the loop to the closing gate.
function featureIdResolves(requirements, cutFeatures, id) {
  const owner = (requirements.features ?? []).find((f) =>
    (f.requirements ?? []).some((r) => r.id === id));
  if (!owner) return false;
  return mustHaveFeatures(requirements, cutFeatures).some((f) => f.slug === owner.slug);
}

async function loadRequirements(root) {
  try {
    return JSON.parse(await readFile(requirementsPath(root), 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT'
      ? `no requirements.json at ${requirementsPath(root)} -- run /win-hackathon:requirements first`
      : `${requirementsPath(root)} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'status') {
  const root = target ? path.resolve(target) : process.cwd();
  const requirements = await loadRequirements(root);
  await migrateStateFile(root);
  const state = await readState(root);
  const cutFeatures = state?.project?.cut_features ?? [];
  const result = await nextFeature(root, requirements, cutFeatures, { featureId });
  if (result === null) {
    if (featureId && !featureIdResolves(requirements, cutFeatures, featureId)) {
      console.error(
        `FR-id "${featureId}" does not resolve to a kept must-have feature -- check it isn't a typo or a cut feature.`,
      );
      process.exit(1);
    }
    console.log('Every must-have, non-cut feature is done. Run build.mjs gate to close the phase.');
    process.exit(0);
  }
  const bundle = await buildContextBundle(root, result.feature);
  console.log(`Next feature: ${result.feature.id} ${result.feature.title} (${result.feature.slug})`);
  console.log(`Spec folder: ${path.join(specsDir(root), result.feature.dir)}`);
  for (const [key, value] of Object.entries(bundle)) {
    console.log(`  ${key}: ${value === null ? 'MISSING' : 'present'}`);
  }
} else if (subcommand === 'gate') {
  const root = target ? path.resolve(target) : process.cwd();
  const requirements = await loadRequirements(root);
  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) { console.error('no state.json -- run /win-hackathon:init first'); process.exit(1); }
  const cutFeatures = state.project?.cut_features ?? [];
  const remaining = await nextFeature(root, requirements, cutFeatures);
  if (remaining !== null) {
    console.log(`Not done: ${remaining.feature.id} (${remaining.feature.slug}) still has unchecked tasks.`);
    process.exit(1);
  }
  const features = mustHaveFeatures(requirements, cutFeatures);
  const artifacts = features.map((f) => `${specsDir(root).replace(`${root}${path.sep}`, '')}/${f.dir}/tasks.md`);
  await writeState(root, {
    ...state,
    phases: { ...state.phases, build: { ...state.phases.build, status: 'awaiting_approval', artifacts } },
  });
  console.log('Phase "build" is now awaiting_approval.');
} else {
  usage();
}
