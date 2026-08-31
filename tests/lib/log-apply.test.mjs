import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { appendChallenge } from '../../scripts/lib/log-apply.mjs';
import { withTmpDir } from '../helpers/tmp.mjs';

test('appendChallenge creates challenges.md with the standard header when missing', async () => {
  await withTmpDir(async (root) => {
    const now = new Date('2026-08-31T10:00:00Z');
    const rel = await appendChallenge(root, 'Bedrock streaming truncated at 4KB', { now });
    assert.equal(rel, '.hackathon/challenges.md');
    const content = await readFile(path.join(root, rel), 'utf8');
    assert.match(content, /^# Challenges\n\nIssues hit during the build, newest last\.\n/);
    assert.match(content, /## 2026-08-31T10:00:00\.000Z/);
    assert.match(content, /Bedrock streaming truncated at 4KB/);
  });
});

test('appendChallenge appends after existing entries, newest last', async () => {
  await withTmpDir(async (root) => {
    const dir = path.join(root, '.hackathon');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'challenges.md'), '# Challenges\n\nIssues hit during the build, newest last.\n\n## 2026-08-30T09:00:00.000Z\n\nFirst issue\n', 'utf8');
    await appendChallenge(root, 'Second issue', { now: new Date('2026-08-31T10:00:00Z') });
    const content = await readFile(path.join(dir, 'challenges.md'), 'utf8');
    assert.ok(content.indexOf('First issue') < content.indexOf('Second issue'));
  });
});

test('appendChallenge trims the entry and rejects empty text', async () => {
  await withTmpDir(async (root) => {
    await appendChallenge(root, '  Trailing whitespace kept out  ', { now: new Date() });
    const content = await readFile(path.join(root, '.hackathon', 'challenges.md'), 'utf8');
    assert.match(content, /^Trailing whitespace kept out$/m);
    await assert.rejects(() => appendChallenge(root, '   '), /refusing to log an empty entry/);
  });
});
