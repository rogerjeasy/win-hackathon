#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRequirements } from './lib/requirements-schema.mjs';
import { applyRequirements } from './lib/requirements-apply.mjs';
import { requirementsPath, reconPath, architecturePath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: requirements.mjs validate <path-to-requirements.json> [--json]');
  console.error('       requirements.mjs apply <project-root> [--requirements <path>] [--dry-run]');
  process.exit(2);
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
  const reqs = await readJson(path.resolve(target));
  const root = path.resolve(path.dirname(target), '..');
  const recon = await readJson(reconPath(root), { optional: true });
  const architecture = await readJson(architecturePath(root), { optional: true });
  const result = validateRequirements(reqs, { recon, architecture });

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('requirements.json is valid.');
    process.exit(0);
  }
  console.error(`requirements.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--requirements');
  const source = idx === -1 ? requirementsPath(root) : path.resolve(rest[idx + 1]);
  const reqs = await readJson(source);
  const recon = await readJson(reconPath(root), { optional: true });
  const architecture = await readJson(architecturePath(root), { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, backedUp, skipped, wouldOverwrite } = await applyRequirements(
      root, reqs, { recon, architecture, dryRun },
    );
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    // The consent gate: commands/requirements.md tells the agent to name these to the user
    // before applying, which it can only do if the preview actually reports them.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }
    if (backedUp.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (skipped.length > 0) {
      console.log('\nLeft in place:');
      for (const s of skipped) console.log(`  ~ ${s}`);
    }
    if (!dryRun) {
      console.log('\nPhase "requirements" is now awaiting_approval. Show the criteria coverage table, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
