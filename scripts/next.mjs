#!/usr/bin/env node
import { resolveNext } from './lib/resolve-next.mjs';

const args = process.argv.slice(2);
const root = args[0] && !args[0].startsWith('--') ? args[0] : process.cwd();
const asJson = args.includes('--json');

const resolution = await resolveNext(root);

if (asJson) {
  console.log(JSON.stringify(resolution, null, 2));
} else {
  console.log(`outcome: ${resolution.outcome}`);
  if (resolution.phase) console.log(`phase:   ${resolution.phase}`);
  console.log(resolution.reason);
}
