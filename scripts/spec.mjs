#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applySpec } from './lib/spec-apply.mjs';
import { requirementsPath, architecturePath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: spec.mjs apply <project-root> [--requirements <path>] [--architecture <path>] [--dry-run]');
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

if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const reqIdx = rest.indexOf('--requirements');
  const reqSource = reqIdx === -1 ? requirementsPath(root) : path.resolve(rest[reqIdx + 1]);
  const archIdx = rest.indexOf('--architecture');
  const archSource = archIdx === -1 ? architecturePath(root) : path.resolve(rest[archIdx + 1]);
  const requirements = await readJson(reqSource);
  const architecture = await readJson(archSource, { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const { artifacts, openspec, skipped } = await applySpec(root, { requirements, architecture, dryRun });

    // Two labelled groups, not one flat list: the Kiro triad is certain — it depends on no
    // external tool — while the OpenSpec proposals are contingent on the CLI being reachable.
    // A single flat list would make a dry run's proposal paths (which may never materialise
    // if the CLI is unreachable) read as just as sure a thing as the triad's.
    const proposals = artifacts.filter((a) => a.includes('openspec/changes'));
    const kiro = artifacts.filter((a) => !proposals.includes(a));

    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    console.log('\nKiro spec triad (certain — independent of any external tool):');
    for (const a of kiro) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    console.log('\nOpenSpec change proposals (contingent on the CLI being reachable):');
    if (proposals.length > 0) {
      for (const a of proposals) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    } else {
      console.log('  (none written — see OpenSpec status below)');
    }

    if (skipped.length > 0) {
      console.log('\nLeft in place:');
      for (const s of skipped) console.log(`  ~ ${s}`);
    }

    // openspec.reason is printed whenever it is present, regardless of openspec.status. On a
    // dry run status is 'written' (the interface only allows 'written' | 'deferred', and a
    // preview is not a failure) but reason still carries the "nothing has been written yet"
    // caveat — gating this to the deferred branch alone would silently drop that caveat from
    // every dry run.
    if (openspec.reason) {
      console.log(`\nOpenSpec: ${dryRun ? 'DRY RUN' : 'DEFERRED'}`);
      console.log(`  ${openspec.reason}`);
      console.log(`  ${dryRun ? 'Would run' : 'Run this when the CLI is reachable'}: ${openspec.command}`);
    }

    if (!dryRun) {
      console.log('\nPhase "spec" is now awaiting_approval. Show what landed, then ask.');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
