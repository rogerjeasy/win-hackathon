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

// Guards the stdin-read path against hanging forever when stdin is a non-TTY pipe that
// nothing ever writes to or closes (the default shape of a programmatic invocation with no
// heredoc, e.g. a bare CI/agent Bash call). The sanctioned commands/log.md heredoc flow
// writes and closes stdin essentially instantly, well inside this window; a pipe that never
// closes is treated as "no text provided" instead of blocking indefinitely.
const STDIN_TIMEOUT_MS = 200;
const STDIN_TIMED_OUT = Symbol('stdin-timed-out');

async function readStdinOrTimeout(ms) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(STDIN_TIMED_OUT), ms);
    timer.unref();
  });
  try {
    return await Promise.race([readStdin(), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

let text;
if (rest.length > 0) {
  text = rest.join(' ');
} else if (!process.stdin.isTTY) {
  const result = await readStdinOrTimeout(STDIN_TIMEOUT_MS);
  if (result === STDIN_TIMED_OUT) {
    console.error(USAGE);
    process.exit(2);
  }
  text = result;
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
