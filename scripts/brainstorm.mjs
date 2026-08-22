#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateIdeas } from './lib/ideas-schema.mjs';
import { applyIdeas, archiveRound } from './lib/brainstorm-apply.mjs';
import { ideasPath, reconPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: brainstorm.mjs validate <path-to-ideas.json> [--recon <path>] [--json]');
  console.error('       brainstorm.mjs archive <project-root>');
  console.error('       brainstorm.mjs apply <project-root> [--ideas <path>]');
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
  const doc = await readJson(path.resolve(target));
  const idx = rest.indexOf('--recon');
  const recon = idx === -1 ? undefined : await readJson(path.resolve(rest[idx + 1]));
  const result = validateIdeas(doc, recon);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  // Warnings surface why a narrowed validation happened — no recon, or a recon with an
  // empty/malformed rubric — so a caller isn't left guessing why membership or ceiling
  // checks were skipped. Print them regardless of the outcome.
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('ideas.json is valid.');
    process.exit(0);
  }
  console.error(`ideas.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'archive') {
  const root = target ? path.resolve(target) : process.cwd();
  const { round, moved } = await archiveRound(root);
  if (round === null) {
    console.log('Nothing to archive — no current round on disk.');
  } else {
    console.log(`Preserved round ${round}:`);
    for (const m of moved) console.log(`  ${m}`);
  }
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--ideas');
  const source = idx === -1 ? ideasPath(root) : path.resolve(rest[idx + 1]);
  const doc = await readJson(source);

  try {
    const { artifacts } = await applyIdeas(root, doc);
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    console.log(`\nRubric: ${reconPath(root)}`);
    console.log('Phase "brainstorm" is now awaiting_approval. Present the shortlist and ask which idea to take.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
