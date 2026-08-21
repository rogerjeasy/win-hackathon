import path from 'node:path';

export const HACKATHON_DIR = '.hackathon';
export const STATE_FILE = 'state.json';

export const PHASES = [
  'recon', 'brainstorm', 'describe', 'stack', 'architect',
  'requirements', 'spec', 'build', 'ship', 'review', 'submit',
];

export function statePath(root) {
  return path.join(root, HACKATHON_DIR, STATE_FILE);
}

export function backupDir(root, stamp) {
  return path.join(root, HACKATHON_DIR, 'backups', stamp);
}

/** Filesystem-safe ISO timestamp, e.g. 2026-08-21T14-32-05Z */
export function timestamp(now = new Date()) {
  return now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}
