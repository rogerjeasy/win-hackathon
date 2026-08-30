#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateDeploy } from './lib/deploy-schema.mjs';
import { applyShip, selectTargets } from './lib/ship-apply.mjs';
import { deployPath, stackPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: ship.mjs suggest <project-root>');
  console.error('       ship.mjs validate <path-to-deploy.json> [--json]');
  console.error('       ship.mjs apply <project-root> [--deploy <path>] [--dry-run]');
  process.exit(2);
}

if (subcommand === 'suggest') {
  const root = target ? path.resolve(target) : process.cwd();
  let stack;
  try {
    stack = JSON.parse(await readFile(stackPath(root), 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT'
      ? `no stack.json at ${stackPath(root)} -- run /win-hackathon:stack first`
      : `${stackPath(root)} is not valid JSON`);
    process.exit(1);
  }
  for (const t of selectTargets(stack)) console.log(`${t.slotId} -> ${t.target}`);
  process.exit(0);
}

async function readJson(p, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (optional && err.code === 'ENOENT') return undefined;
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'validate') {
  if (!target) usage();
  const deploy = await readJson(path.resolve(target));
  const root = path.resolve(path.dirname(target), '..');
  const stack = await readJson(stackPath(root), { optional: true });
  const result = validateDeploy(deploy, stack);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('deploy.json is valid.');
    process.exit(0);
  }
  console.error(`deploy.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--deploy');
  const source = idx === -1 ? deployPath(root) : path.resolve(rest[idx + 1]);
  const deploy = await readJson(source);
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, backedUp, wouldOverwrite } = await applyShip(root, deploy, { dryRun });
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }
    if (backedUp?.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (!dryRun) {
      console.log('\nPhase "ship" is now awaiting_approval. Present every service URL, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
