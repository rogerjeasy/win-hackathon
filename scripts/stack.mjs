#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateStack } from './lib/stack-schema.mjs';
import { applyStack } from './lib/stack-apply.mjs';
import { stackPath, reconPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: stack.mjs validate <path-to-stack.json> [--json]');
  console.error('       stack.mjs apply <project-root> [--stack <path>] [--dry-run]');
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
  const stack = await readJson(path.resolve(target));
  // Validate against the real recon when one is on disk beside it, so mandate coverage
  // is actually checked rather than silently skipped.
  const root = path.resolve(path.dirname(target), '..');
  const recon = await readJson(reconPath(root), { optional: true });
  const result = validateStack(stack, recon);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('stack.json is valid.');
    process.exit(0);
  }
  console.error(`stack.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--stack');
  const source = idx === -1 ? stackPath(root) : path.resolve(rest[idx + 1]);
  const stack = await readJson(source);
  const recon = await readJson(reconPath(root), { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, backedUp, wouldOverwrite } = await applyStack(root, stack, { recon, dryRun });
    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    // The consent gate: commands/stack.md tells the agent to name these to the user before
    // applying, which it can only do if the preview actually reports them.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }
    if (backedUp?.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
    }
    if (!dryRun) {
      console.log('\nPhase "stack" is now awaiting_approval. Present the slot table, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
