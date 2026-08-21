import { copyFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { backupDir } from './paths.mjs';

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
