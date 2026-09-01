#!/usr/bin/env node
import path from 'node:path';
import { appendChallenge } from './lib/log-apply.mjs';

const USAGE = 'usage: log.mjs <project-root> <text...>   (or pipe/heredoc text on stdin with no <text...> args)';

const [target, ...rest] = process.argv.slice(2);
if (!target) {
  console.error(USAGE);
  process.exit(2);
}

const root = path.resolve(target);

// commands/log.md passes $ARGUMENTS through a quoted heredoc on stdin, not as shell-
// interpolated argv, so that backticks/$() in a challenge description can never be
// executed by the shell before this script ever sees the text. The positional-args path
// below still works for direct/manual invocation.
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

let text;
if (rest.length > 0) {
  text = rest.join(' ');
} else if (!process.stdin.isTTY) {
  text = await readStdin();
} else {
  console.error(USAGE);
  process.exit(2);
}

try {
  const rel = await appendChallenge(root, text);
  console.log(`Appended to ${rel}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
