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
    const {
      artifacts, openspec, skipped, backedUp, warnings, wouldOverwrite,
    } = await applySpec(root, { requirements, architecture, dryRun });

    // :spec has no `validate` subcommand of its own (it validates the requirements payload
    // :requirements already produced), so `apply` is the only place these warnings can ever
    // surface — unlike stack/architect/requirements, where a separate `validate` subcommand
    // prints them. Without this, an absent architecture.json degrades every design.md to a
    // stub with no signal to the user, even though Step 3 of the command promises design.md
    // IS the architecture slice.
    for (const w of warnings ?? []) console.log(`warning: ${w}`);

    // The certain/contingent split uses openspec.artifacts directly — it is already the
    // exact structural list runOpenspec() returns — rather than re-deriving it by filtering
    // the flat array on a path-substring convention that would silently stop matching if
    // CHANGES_DIR were ever renamed.
    const proposals = openspec.artifacts;
    const proposalSet = new Set(proposals);
    const kiro = artifacts.filter((a) => !proposalSet.has(a));

    console.log(dryRun ? 'Dry run — nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
    console.log('\nKiro spec triad (certain — independent of any external tool):');
    for (const a of kiro) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    console.log('\nOpenSpec change proposals (contingent on the CLI being reachable):');
    if (proposals.length > 0) {
      for (const a of proposals) console.log(`  ${dryRun ? '?' : '+'} ${a}`);
    } else {
      console.log('  (none written — see OpenSpec status below)');
    }

    // The consent gate: commands/spec.md tells the agent to name these to the user before
    // applying, which it can only do if the preview actually reports them. tasks.md matters
    // most — a build agent ticks it off, and a rerun regenerates it.
    if (wouldOverwrite?.length > 0) {
      console.log('\nWould overwrite:');
      for (const w of wouldOverwrite) console.log(`  ! ${w}`);
    }

    if (backedUp?.length > 0) {
      console.log('\nBacked up before overwriting:');
      for (const b of backedUp) console.log(`  ~ ${b}`);
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
