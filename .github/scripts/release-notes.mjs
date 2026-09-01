#!/usr/bin/env node
// Extracts one version's section out of CHANGELOG.md so the release workflow can hand it
// to `gh release create --notes-file`. Not part of the plugin itself -- CI-only tooling,
// which is why it lives under .github/ rather than scripts/.
//
// Usage: node .github/scripts/release-notes.mjs <tag> [changelog-path] [out-path]

import { readFileSync, writeFileSync } from 'node:fs';

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node .github/scripts/release-notes.mjs <tag> [changelog-path] [out-path]');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
const changelogPath = process.argv[3] ?? 'CHANGELOG.md';
const outPath = process.argv[4] ?? 'release-notes.md';
const heading = `## [${version}]`;

const changelog = readFileSync(changelogPath, 'utf8');
const lines = changelog.split('\n');

const start = lines.findIndex((line) => line.startsWith(heading));
if (start === -1) {
  console.error(`No "${heading}" section found in ${changelogPath} -- add one before tagging ${tag}.`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i += 1) {
  if (lines[i].startsWith('## [')) {
    end = i;
    break;
  }
}

const section = lines.slice(start + 1, end).join('\n').trim();
if (!section) {
  console.error(`The "${heading}" section in ${changelogPath} is empty -- add release notes before tagging ${tag}.`);
  process.exit(1);
}

writeFileSync(outPath, `${section}\n`);
console.log(`Wrote ${outPath} from ${changelogPath} ${heading}`);
