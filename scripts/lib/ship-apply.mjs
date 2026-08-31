/**
 * Same shape as stack-apply.mjs: validate (loading stack.json for the cross-check) first,
 * before anything touches state -- then precondition-check, compute the file list in
 * memory, dry-run branch, backup+write, merge state. deploy-engineer writes the actual
 * Dockerfile/Terraform/workflow content itself (via its own Write/Bash calls, guided by
 * the containerization/iac-terraform/cicd-github-actions skills) -- this module only
 * persists the validated deploy.json contract and the state digest, exactly as
 * architect-apply.mjs persists architecture.json without drawing the diagrams itself.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, DEPLOY_FILE, stackPath, statePath, timestamp } from './paths.mjs';
import { deployableSlots } from './deploy-schema.mjs';
import { readState, writeState, migrateStateFile, readMigratedState } from './state.mjs';
import { openBackupSet, existingPaths } from './backup.mjs';
import { validateDeploy } from './deploy-schema.mjs';

const rel = (name) => `${HACKATHON_DIR}/${name}`;

const CLOUD_BY_KEYWORD = [
  [/vercel/i, 'vercel'], [/cloud run|gcp|google/i, 'cloud-run'],
  [/railway/i, 'railway'], [/render/i, 'render'], [/aws|amazon/i, 'aws'],
];

function sponsorMandatedTarget(slot) {
  if (slot?.source !== 'required') return null;
  const hit = CLOUD_BY_KEYWORD.find(([re]) => re.test(slot.choice ?? ''));
  return hit ? hit[1] : null;
}

export function selectTargets(stack) {
  return deployableSlots(stack)
    .map((s) => {
      const mandated = sponsorMandatedTarget(s);
      if (mandated) return { slotId: s.id, kind: s.kind ?? 'backend', target: mandated };
      const kind = s.kind ?? (/(front|web|ui)/i.test(s.id ?? '') ? 'frontend' : 'backend');
      const target = kind === 'frontend'
        ? 'vercel'
        : (stack.repo_shape === 'multi-service' ? 'cloud-run' : 'vercel');
      return { slotId: s.id, kind, target };
    });
}

export async function applyShip(root, deploy, { dryRun = false, stamp: stampOverride } = {}) {
  let stack = null;
  try {
    stack = JSON.parse(await readFile(stackPath(root), 'utf8'));
  } catch { /* validateDeploy degrades to a warning when stack is absent */ }

  const { valid, errors } = validateDeploy(deploy, stack);
  if (!valid) throw new Error(`refusing to apply an invalid deploy payload:\n  ${errors.join('\n  ')}`);

  let state;
  if (dryRun) {
    state = await readMigratedState(root);
  } else {
    await migrateStateFile(root);
    state = await readState(root);
  }
  if (state === null) throw new Error(`no state at ${statePath(root)} -- run /win-hackathon:init first`);
  if (state.phases?.stack?.status !== 'approved') {
    throw new Error('cannot ship before :stack is approved -- run /win-hackathon:stack first');
  }

  const files = [[DEPLOY_FILE, `${JSON.stringify(deploy, null, 2)}\n`]];
  const artifacts = files.map(([name]) => rel(name));
  if (dryRun) return { artifacts, backedUp: [], wouldOverwrite: await existingPaths(root, artifacts) };

  const dir = path.join(root, HACKATHON_DIR);
  await mkdir(dir, { recursive: true });
  const set = openBackupSet(root, stampOverride ?? timestamp());
  const backedUp = [];
  for (const [name] of files) {
    const saved = await set.backup(rel(name));
    if (saved !== null) backedUp.push(rel(name));
  }
  for (const [name, body] of files) {
    await writeFile(path.join(dir, name), body, 'utf8');
  }

  const frontend = deploy.services.find((s) => s.kind === 'frontend') ?? deploy.services[0];
  const next = {
    ...state,
    project: {
      ...state.project,
      deploy: { primary_url: frontend?.url ?? null, ref: rel(DEPLOY_FILE) },
    },
    phases: {
      ...state.phases,
      ship: { ...state.phases.ship, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, backupStamp: set.stamp };
}
