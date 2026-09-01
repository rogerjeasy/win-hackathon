#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSubmission } from './lib/submission-schema.mjs';
import { applySubmission } from './lib/submission-apply.mjs';
import { reconPath, stackPath, deployPath, submissionPath } from './lib/paths.mjs';
import { readState } from './lib/state.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: submit.mjs validate <path-to-submission.json> [--json]');
  console.error('       submit.mjs apply <project-root> [--submission <path>] [--dry-run]');
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
  const submission = await readJson(path.resolve(target));
  const root = path.resolve(path.dirname(target), '..');
  const recon = await readJson(reconPath(root), { optional: true });
  const state = await readState(root).catch(() => null);
  const result = validateSubmission(submission, { recon, state });
  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) { console.log('submission.json is valid.'); process.exit(0); }
  console.error(`submission.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--submission');
  if (idx !== -1 && rest[idx + 1] === undefined) usage();
  const source = idx === -1 ? submissionPath(root) : path.resolve(rest[idx + 1]);
  const submission = await readJson(source);
  const recon = await readJson(reconPath(root), { optional: true });
  const stack = await readJson(stackPath(root), { optional: true });
  const deployDoc = await readJson(deployPath(root), { optional: true });
  const dryRun = flags.has('--dry-run');

  try {
    const {
      artifacts, backedUp, wouldOverwrite, requirementsComplete, outstanding,
    } = await applySubmission(root, submission, { recon, stack, deploy: deployDoc, dryRun });
    console.log(dryRun ? 'Dry run -- nothing was written. Would write:' : `Wrote ${artifacts.length} artifact(s):`);
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
      if (requirementsComplete) {
        console.log('\nEvery hard submission requirement is done or skipped. Phase "submit" is now awaiting_approval.');
      } else {
        console.log(`\nOutstanding: ${outstanding.join(', ')}. Phase "submit" stays in_progress.`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
