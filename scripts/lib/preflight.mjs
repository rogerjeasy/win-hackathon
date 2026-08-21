import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DEFAULT_TOOLS = [
  { name: 'git', cmd: 'git', args: ['--version'], needate: 'everything', blocking: true },
  { name: 'node', cmd: 'node', args: ['--version'], needate: 'Next.js, OpenSpec', blocking: true },
  { name: 'python3', cmd: 'python3', args: ['--version'], needate: 'FastAPI backends', blocking: false },
  { name: 'poetry', cmd: 'poetry', args: ['--version'], needate: 'Python dependency management', blocking: false },
  { name: 'uv', cmd: 'uv', args: ['--version'], needate: 'Python dependency management (alternative to poetry)', blocking: false },
  { name: 'docker', cmd: 'docker', args: ['--version'], needate: 'containerization in :ship', blocking: false },
  { name: 'gh', cmd: 'gh', args: ['--version'], needate: 'repo creation, CI setup', blocking: false },
];

function firstVersionLine(stdout) {
  const line = stdout.trim().split('\n')[0] ?? '';
  const m = line.match(/v?\d+\.\d+(\.\d+)?/);
  return m ? m[0] : line || null;
}

export async function checkTools(tools = DEFAULT_TOOLS) {
  return Promise.all(tools.map(async (t) => {
    try {
      const { stdout } = await run(t.cmd, t.args, { timeout: 5000 });
      return { name: t.name, present: true, version: firstVersionLine(stdout), needate: t.needate, blocking: t.blocking };
    } catch {
      return { name: t.name, present: false, version: null, needate: t.needate, blocking: t.blocking };
    }
  }));
}
