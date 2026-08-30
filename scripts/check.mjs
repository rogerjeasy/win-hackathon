#!/usr/bin/env node
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { applyCompliance } from './lib/compliance-apply.mjs';

const [subcommand, target, reportPath] = process.argv.slice(2);

function usage() {
  console.error('usage: check.mjs apply <project-root> <path-to-report.json>');
  process.exit(2);
}

if (subcommand !== 'apply' || !target || !reportPath) usage();

const root = path.resolve(target);
let report;
try {
  report = JSON.parse(await readFile(path.resolve(reportPath), 'utf8'));
} catch (err) {
  console.error(err.code === 'ENOENT' ? `no such file: ${reportPath}` : `${reportPath} is not valid JSON`);
  process.exit(1);
}

try {
  const { outstanding, forbiddenFound } = await applyCompliance(root, report);
  await unlink(path.resolve(reportPath)).catch(() => {}); // best-effort -- never a durable artifact
  if (outstanding.length === 0 && forbiddenFound.length === 0) {
    console.log('All required technology verified. No forbidden technology found.');
    process.exit(0);
  }
  if (outstanding.length > 0) {
    console.log('Required technology not yet verified (a manifest entry is not evidence):');
    for (const id of outstanding) console.log(`  [ ] ${id}`);
  }
  if (forbiddenFound.length > 0) {
    console.log('Forbidden technology found:');
    for (const id of forbiddenFound) console.log(`  ! ${id}`);
  }
  process.exit(1);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
