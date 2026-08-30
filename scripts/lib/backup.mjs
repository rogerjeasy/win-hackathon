import { copyFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { HACKATHON_DIR, backupDir } from './paths.mjs';

/**
 * Copies one pre-existing file into `backups/<stamp>/<relPath>`. Returns null when there is
 * nothing to back up. Callers that back up more than one file in a single run should use
 * openBackupSet() instead, which additionally guarantees the run gets a directory of its own.
 */
export async function backupFile(root, relPath, stamp) {
  const src = path.join(root, relPath);
  try {
    await access(src);
  } catch {
    return null;
  }
  const dest = path.join(backupDir(root, stamp), relPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(src, dest);
  return dest;
}

/**
 * Claims a backup directory nobody else is using, by creating it. `timestamp()` has
 * one-second resolution, so two applies of the same command inside one wall-clock second
 * would otherwise share a directory and the second run's copyFile() would silently overwrite
 * — and destroy — what the first run had preserved there. A finer-grained clock only narrows
 * that window; creating the directory with a non-recursive mkdir closes it, because mkdir
 * fails with EEXIST rather than succeeding on a directory that already exists. A taken name
 * gets a numeric suffix: `<stamp>`, then `<stamp>-2`, `<stamp>-3`, ...
 */
async function claimBackupDir(root, stamp) {
  await mkdir(path.join(root, HACKATHON_DIR, 'backups'), { recursive: true });
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? stamp : `${stamp}-${n}`;
    try {
      // Deliberately NOT recursive: recursive mkdir treats an existing directory as success,
      // which is exactly the collision this needs to detect.
      await mkdir(backupDir(root, candidate));
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/**
 * One backup set for one apply invocation. Every file backed up through the returned handle
 * lands in the same directory (that co-timestamped set is the whole backup promise), and no
 * other invocation can land in it.
 *
 * The directory is claimed lazily, on the first file that actually needs backing up, so an
 * apply run that overwrites nothing leaves no empty directory behind.
 */
export function openBackupSet(root, stamp) {
  let claimed = null;
  return {
    /** Returns the destination path, or null when `relPath` does not exist yet. */
    async backup(relPath) {
      const src = path.join(root, relPath);
      try {
        await access(src);
      } catch {
        return null;
      }
      if (claimed === null) claimed = await claimBackupDir(root, stamp);
      const dest = path.join(backupDir(root, claimed), relPath);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      return dest;
    },
    /** The directory name actually used, or null while nothing has been backed up. */
    get stamp() {
      return claimed;
    },
  };
}

/**
 * Which of `relPaths` already exist under `root`. Used by every apply module's dry-run branch
 * to answer "what would this overwrite?" without writing anything — the preview the command
 * files' overwrite-consent step asks the agent to relay to the user.
 */
export async function existingPaths(root, relPaths) {
  const checked = await Promise.all(relPaths.map(async (rel) =>
    access(path.join(root, rel)).then(() => rel).catch(() => null)));
  return checked.filter((rel) => rel !== null);
}
