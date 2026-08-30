#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateArchitecture } from './lib/architecture-schema.mjs';
import { applyArchitecture } from './lib/architect-apply.mjs';
import { architecturePath, stackPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: architect.mjs validate <path-to-architecture.json> [--json]');
  console.error('       architect.mjs apply <project-root> [--architecture <path>] [--dry-run]');
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
  const arch = await readJson(path.resolve(target));
  const root = path.resolve(path.dirname(target), '..');
  const stack = await readJson(stackPath(root), { optional: true });
  const result = validateArchitecture(arch, stack);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('architecture.json is valid.');
    process.exit(0);
  }
  console.error(`architecture.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--architecture');
  const source = idx === -1 ? architecturePath(root) : path.resolve(rest[idx + 1]);
  const arch = await readJson(source);
  const stack = await readJson(stackPath(root), { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, backedUp, wouldOverwrite } = await applyArchitecture(root, arch, { stack, dryRun });
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    // The consent gate: commands/architect.md tells the agent to name these to the user
    // before applying, which it can only do if the preview actually reports them.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }
    if (backedUp.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (!dryRun) {
      console.log('\nPhase "architect" is now awaiting_approval. Show the diagram and the invariants, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
