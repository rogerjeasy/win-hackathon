#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { validateReview } from './lib/review-schema.mjs';
import { mergeFindings, applyReview } from './lib/review-apply.mjs';
import { HACKATHON_DIR, REVIEW_FILE, reviewPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const positional = rest.filter((a) => !a.startsWith('--'));

function usage() {
  console.error('usage: review.mjs merge <project-root> <code-review-findings.json> <quality-reviewer-findings.json>');
  console.error('       review.mjs validate <path-to-review.json> [--json]');
  console.error('       review.mjs apply <project-root> [--dry-run]');
  process.exit(2);
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT' ? `no such file: ${p}` : `${p} is not valid JSON`);
    process.exit(1);
  }
}

if (subcommand === 'merge') {
  const [codeReviewPath, qualityReviewerPath] = positional;
  if (!target || !codeReviewPath || !qualityReviewerPath) usage();
  const root = path.resolve(target);
  const codeReviewFindings = await readJson(path.resolve(codeReviewPath));
  const qualityReviewerFindings = await readJson(path.resolve(qualityReviewerPath));
  const merged = mergeFindings(codeReviewFindings, qualityReviewerFindings);
  const { valid, errors } = validateReview(merged);
  if (!valid) {
    console.error(`merged review is not valid (${errors.length} problem(s)):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const dest = reviewPath(root);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${HACKATHON_DIR}/${REVIEW_FILE} -- ${merged.findings.length} finding(s).`);
} else if (subcommand === 'validate') {
  if (!target) usage();
  const review = await readJson(path.resolve(target));
  const result = validateReview(review);
  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  if (result.valid) { console.log('review.json is valid.'); process.exit(0); }
  console.error(`review.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const dryRun = flags.has('--dry-run');
  const review = await readJson(reviewPath(root));
  try {
    const {
      artifacts, backedUp, wouldOverwrite, clean, blocking,
    } = await applyReview(root, review, { dryRun });
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
      if (clean) {
        console.log('\nNo blocking findings. Phase "review" is now awaiting_approval.');
      } else {
        console.log(`\nBlocking findings remain: ${blocking.join(', ')}. Phase "review" stays in_progress.`);
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
