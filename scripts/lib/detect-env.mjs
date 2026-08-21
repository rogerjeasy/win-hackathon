import { readdir, stat, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { statePath } from './paths.mjs';

const run = promisify(execFile);

const AGENT_CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules'];
const AGENT_CONFIG_DIRS = ['.claude', '.cursor'];

const SOURCE_MARKERS = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod',
  'Cargo.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'composer.json',
];
const SOURCE_DIRS = ['src', 'app', 'lib', 'api', 'web', 'server'];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function isDir(p) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

export async function detectEnvironment(root) {
  const entries = await readdir(root).catch(() => []);
  const visible = entries.filter((e) => !e.startsWith('.'));

  const hasOurState = await exists(statePath(root));

  const foreignAgentFiles = [];
  for (const f of AGENT_CONFIG_FILES) {
    if (await exists(path.join(root, f))) foreignAgentFiles.push(f);
  }
  for (const d of AGENT_CONFIG_DIRS) {
    if (await isDir(path.join(root, d))) foreignAgentFiles.push(d);
  }
  const hasForeignAgentConfig = foreignAgentFiles.length > 0;

  let hasSourceFiles = SOURCE_MARKERS.some((m) => entries.includes(m));
  if (!hasSourceFiles) {
    for (const d of SOURCE_DIRS) {
      if (await isDir(path.join(root, d))) { hasSourceFiles = true; break; }
    }
  }

  const isEmpty = visible.length === 0;
  const isGitRepo = await isDir(path.join(root, '.git'));

  let isDirty = false;
  if (isGitRepo) {
    const { stdout } = await run('git', ['status', '--porcelain'], { cwd: root })
      .catch(() => ({ stdout: '' }));
    isDirty = stdout.trim().length > 0;
  }

  let mode;
  if (hasOurState) mode = 'resume';
  else if (hasForeignAgentConfig) mode = 'adopt';
  else if (hasSourceFiles) mode = 'retrofit';
  else mode = 'greenfield';

  const scenarios = [];
  if (isEmpty) scenarios.push('A');
  if (hasForeignAgentConfig && !hasOurState) scenarios.push('B');
  if (hasOurState) scenarios.push('C');
  if (hasSourceFiles && !hasOurState && !hasForeignAgentConfig) scenarios.push('D');
  if (!isGitRepo) scenarios.push('E');
  if (isDirty) scenarios.push('F');

  return {
    scenarios, mode, isGitRepo, isDirty, hasOurState,
    hasForeignAgentConfig, foreignAgentFiles, hasSourceFiles, isEmpty,
  };
}
