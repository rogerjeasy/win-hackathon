import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../scripts/lib/schema.mjs';
import { readState, writeState } from '../../scripts/lib/state.mjs';
import { applyStack } from '../../scripts/lib/stack-apply.mjs';
import { applyArchitecture } from '../../scripts/lib/architect-apply.mjs';
import { applyRequirements } from '../../scripts/lib/requirements-apply.mjs';
import { applySpec } from '../../scripts/lib/spec-apply.mjs';
import { applyShip } from '../../scripts/lib/ship-apply.mjs';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'));
const okExec = async () => ({ code: 0, stdout: '', stderr: '' });

async function approve(root, phase) {
  const s = await readState(root);
  s.phases[phase].status = 'approved';
  await writeState(root, s);
}

/**
 * Scaffolds a project through :spec (recon/brainstorm/describe/stack/architect/
 * requirements/spec all approved) from the h0- fixtures. Extracted from
 * integration-stage2.test.mjs's inline `walk()` so Stage 3/4 integration tests share it
 * instead of duplicating M3's setup. Returns the requirements.json object used, so
 * callers don't need a second fixture read.
 */
export async function scaffoldStage2Project(root, { exec = okExec } = {}) {
  const s = createDefaultState({ pluginVersion: '0.1.0' });
  s.project = { name: 'Kintwadi', selected_idea: 'i1' };
  for (const p of ['recon', 'brainstorm', 'describe']) s.phases[p].status = 'approved';
  await writeState(root, s);

  const [recon, stack, architecture, requirements] = await Promise.all([
    fx('h0-recon.json'), fx('h0-stack.json'), fx('h0-architecture.json'), fx('h0-requirements.json'),
  ]);

  await applyStack(root, stack, { recon });
  await approve(root, 'stack');
  await applyArchitecture(root, architecture, { stack });
  await approve(root, 'architect');
  await applyRequirements(root, requirements, { recon, architecture });
  await approve(root, 'requirements');
  await applySpec(root, { requirements, architecture, exec });
  await approve(root, 'spec');
  return requirements;
}

/**
 * Extends scaffoldStage2Project through an approved :ship, from the h0-deploy.json
 * fixture. Shared by the Stage 1 (:review) and Stage 2 (:submit) integration tests so
 * neither re-derives M4's setup.
 */
export async function scaffoldStage4Project(root, { exec = okExec } = {}) {
  const requirements = await scaffoldStage2Project(root, { exec });
  const deploy = await fx('h0-deploy.json');
  await applyShip(root, deploy, {});
  await approve(root, 'ship');
  return { requirements, deploy };
}
