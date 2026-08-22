#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { applyDescribe, renderStrategySkeleton } from './lib/describe-apply.mjs';
import { reconPath, ideasPath } from './lib/paths.mjs';

const [subcommand, target, ...rest] = process.argv.slice(2);

function flag(name) {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? null : rest[i + 1] ?? null;
}

function usage() {
  console.error('usage: describe.mjs scaffold <project-root> --idea <idea-id>');
  console.error('       describe.mjs apply    <project-root> --idea <idea-id> --track <track-id>');
  process.exit(2);
}

const root = target ? path.resolve(target) : process.cwd();

if (subcommand === 'scaffold') {
  const ideaId = flag('idea');
  if (!ideaId) usage();
  try {
    const recon = JSON.parse(await readFile(reconPath(root), 'utf8'));
    const doc = JSON.parse(await readFile(ideasPath(root), 'utf8'));
    const idea = (doc.ideas ?? []).find((i) => i.id === ideaId);
    if (!idea) throw new Error(`no idea "${ideaId}" in ${ideasPath(root)}`);
    console.log(renderStrategySkeleton({ recon, idea }));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else if (subcommand === 'apply') {
  const ideaId = flag('idea');
  const trackId = flag('track');
  if (!ideaId || !trackId) usage();
  try {
    const { artifacts, bonusSlots } = await applyDescribe(root, { ideaId, trackId });
    console.log(`Wrote ${artifacts.length} artifact(s):`);
    for (const a of artifacts) console.log(`  + ${a}`);
    if (bonusSlots > 0) console.log(`Opened ${bonusSlots} bonus-content slot(s) in state.`);
    console.log('\nPhase "describe" is now awaiting_approval. Read the thesis aloud before asking.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  usage();
}
