import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { upsertBlock } from './markers.mjs';
import { openBackupSet } from './backup.mjs';
import { writeState, readRawState, migrateStateFile } from './state.mjs';
import { createDefaultState, CURRENT_SCHEMA_VERSION } from './schema.mjs';
import { HACKATHON_DIR } from './paths.mjs';

const run = promisify(execFile);
const STATE_REL = `${HACKATHON_DIR}/state.json`;

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

export async function applyInit(root, plan, { consented, pluginVersion, stamp }) {
  const applied = [];
  const skipped = [];
  const backups = [];
  const set = openBackupSet(root, stamp);

  // Scenario C ("our project already"): migrate the schema before anything else reads
  // it. The `create` action below skips state.json when the file already exists, so
  // without this :init is a no-op for a user upgrading from an older plugin version and
  // they are left on a schema every other command rejects. The design makes :init the
  // command that migrates, and makes it back up first
  // (docs/design/win-hackathon-plugin.md: "On mismatch, `:init` migrates and backs up
  // first"), so take the backup while the old file is still on disk.
  const existingState = await readRawState(root);
  if (existingState !== null && existingState.schema_version !== CURRENT_SCHEMA_VERSION) {
    const b = await set.backup(STATE_REL);
    if (b) backups.push(b);
  }
  await migrateStateFile(root);

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
        if (action.path === STATE_REL) {
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
          const b = await set.backup(action.path);
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
