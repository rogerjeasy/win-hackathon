import path from 'node:path';

export const HACKATHON_DIR = '.hackathon';
export const STATE_FILE = 'state.json';
export const RECON_FILE = 'recon.json';
export const IDEAS_FILE = 'ideas.json';

export const PHASES = [
  'recon', 'brainstorm', 'describe', 'stack', 'architect',
  'requirements', 'spec', 'build', 'ship', 'review', 'submit',
];

export function statePath(root) {
  return path.join(root, HACKATHON_DIR, STATE_FILE);
}

export function reconPath(root) {
  return path.join(root, HACKATHON_DIR, RECON_FILE);
}

export function ideasPath(root) {
  return path.join(root, HACKATHON_DIR, IDEAS_FILE);
}

export function backupDir(root, stamp) {
  return path.join(root, HACKATHON_DIR, 'backups', stamp);
}

/** Filesystem-safe ISO timestamp, e.g. 2026-08-21T14-32-05Z */
export function timestamp(now = new Date()) {
  return now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

export const STACK_FILE = 'stack.json';
export const ARCHITECTURE_FILE = 'architecture.json';
export const REQUIREMENTS_FILE = 'requirements.json';
export const SPECS_DIR = 'specs';
export const DOCS_DIR = 'docs';
export const ASSETS_DIR = 'assets';
export const FEATURES_DIR = 'features';

export function stackPath(root) {
  return path.join(root, HACKATHON_DIR, STACK_FILE);
}

export function architecturePath(root) {
  return path.join(root, HACKATHON_DIR, ARCHITECTURE_FILE);
}

export function requirementsPath(root) {
  return path.join(root, HACKATHON_DIR, REQUIREMENTS_FILE);
}

export function specsDir(root) {
  return path.join(root, HACKATHON_DIR, SPECS_DIR);
}

/** Showroom. docs/ is judge-facing and deliberately NOT under .hackathon/. */
export function docsPath(root, name) {
  return path.join(root, DOCS_DIR, name);
}

export function assetsPath(root, name) {
  return path.join(root, DOCS_DIR, ASSETS_DIR, name);
}

export function featurePath(root, slug) {
  return path.join(root, FEATURES_DIR, `${slug}.feature`);
}

export const DEPLOY_FILE = 'deploy.json';

export function deployPath(root) {
  return path.join(root, HACKATHON_DIR, DEPLOY_FILE);
}

export const REVIEW_FILE = 'review.json';

export function reviewPath(root) {
  return path.join(root, HACKATHON_DIR, REVIEW_FILE);
}

export const SUBMISSION_FILE = 'submission.json';

export function submissionPath(root) {
  return path.join(root, HACKATHON_DIR, SUBMISSION_FILE);
}
