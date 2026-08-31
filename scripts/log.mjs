#!/usr/bin/env node
import path from 'node:path';
import { appendChallenge } from './lib/log-apply.mjs';

const [target, ...rest] = process.argv.slice(2);
if (!target || rest.length === 0) {
  console.error('usage: log.mjs <project-root> <text...>');
  process.exit(2);
}

const root = path.resolve(target);
const text = rest.join(' ');

try {
  const rel = await appendChallenge(root, text);
  console.log(`Appended to ${rel}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
