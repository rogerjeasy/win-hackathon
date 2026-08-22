#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRecon } from './lib/recon-schema.mjs';
import { applyRecon } from './lib/recon-apply.mjs';
import { reconPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));

function usage() {
  console.error('usage: recon.mjs validate <path-to-recon.json> [--json]');
  console.error('       recon.mjs apply <project-root> [--recon <path>]');
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

if (subcommand === 'validate') {
  if (!target) usage();
  const recon = await readJson(path.resolve(target));
  const result = validateRecon(recon);

  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  }
  for (const w of result.warnings) console.log(`warning: ${w}`);
  if (result.valid) {
    console.log('recon.json is valid.');
    process.exit(0);
  }
  // Errors go to stderr as a complete list — the agent retrying needs all of them at once.
  console.error(`recon.json is not valid (${result.errors.length} problem(s)):`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
} else if (subcommand === 'apply') {
  const root = target ? path.resolve(target) : process.cwd();
  const idx = rest.indexOf('--recon');
  const source = idx === -1 ? reconPath(root) : path.resolve(rest[idx + 1]);
  const recon = await readJson(source);

  try {
    const { artifacts } = await applyRecon(root, recon);
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    console.log('\nPhase "recon" is now awaiting_approval. Present the brief and rubric, then ask.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
