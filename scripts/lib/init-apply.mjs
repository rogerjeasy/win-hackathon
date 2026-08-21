import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { upsertBlock } from './markers.mjs';
import { backupFile } from './backup.mjs';
import { writeState } from './state.mjs';
import { createDefaultState } from './schema.mjs';
import { HACKATHON_DIR } from './paths.mjs';

const run = promisify(execFile);

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function applyInit(root, plan, { consented, pluginVersion, stamp }) {
  const applied = [];
  const skipped = [];
  const backups = [];

  for (const action of plan.actions) {
    if (action.needsConsent && !consented.has(action.path)) {
      skipped.push(action);
      continue;
    }

    const abs = path.join(root, action.path);

    switch (action.kind) {
      case 'mkdir':
        await mkdir(abs, { recursive: true });
        break;

      case 'create': {
        if (await exists(abs)) { skipped.push(action); continue; }
        if (action.path === `${HACKATHON_DIR}/state.json`) {
          await writeState(root, createDefaultState({ pluginVersion }));
        } else {
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, action.body ?? '', 'utf8');
        }
        break;
      }

      case 'update-block': {
        const before = (await exists(abs)) ? await readFile(abs, 'utf8') : '';
        if (before !== '') {
          const b = await backupFile(root, action.path, stamp);
          if (b) backups.push(b);
        }
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, upsertBlock(before, action.body), 'utf8');
        break;
      }

      case 'git-init':
        await run('git', ['init', '-q'], { cwd: root });
        break;

      default:
        throw new Error(`unknown action kind "${action.kind}"`);
    }

    applied.push(action);
  }

  return { applied, skipped, backups };
}
