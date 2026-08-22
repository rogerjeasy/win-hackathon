#!/usr/bin/env node
import { planInit } from './lib/init-plan.mjs';
import { applyInit } from './lib/init-apply.mjs';
import { renderInitPlan } from './lib/render.mjs';
import { timestamp } from './lib/paths.mjs';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') ? args[0] : process.cwd();

const consentIdx = args.indexOf('--consent');
const consented = new Set(
  consentIdx === -1 ? [] : (args[consentIdx + 1] ?? '').split(',').filter(Boolean),
);

const manifest = JSON.parse(
  await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'),
);

const plan = await planInit(root);

if (!args.includes('--apply')) {
  console.log(renderInitPlan(plan));
  console.log('\n(dry run — nothing was written)');
  process.exit(0);
}

const result = await applyInit(root, plan, {
  consented, pluginVersion: manifest.version, stamp: timestamp(),
});

console.log(`Applied ${result.applied.length} action(s).`);
for (const a of result.applied) console.log(`  + ${a.path}`);
if (result.skipped.length > 0) {
  console.log(`Skipped ${result.skipped.length} (no consent given):`);
  for (const a of result.skipped) console.log(`  - ${a.path}`);
}
for (const b of result.backups) console.log(`  backup: ${b}`);
