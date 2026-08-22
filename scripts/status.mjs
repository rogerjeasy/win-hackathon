#!/usr/bin/env node
import { readState } from './lib/state.mjs';
import { resolveNext } from './lib/resolve-next.mjs';
import { checkTools } from './lib/preflight.mjs';
import { renderStatusBoard } from './lib/render.mjs';

const root = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd();

const state = await readState(root);
if (state === null) {
  console.log('No .hackathon/state.json here. Run /win-hackathon:init to start.');
  process.exit(0);
}

const [resolution, tools] = await Promise.all([resolveNext(root), checkTools()]);
console.log(renderStatusBoard({ state, resolution, tools }));
