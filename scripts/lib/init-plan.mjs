import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { detectEnvironment } from './detect-env.mjs';
import { isFullyManaged, upsertBlock } from './markers.mjs';
import { HACKATHON_DIR } from './paths.mjs';

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Decide how to touch a markdown file we may not own.
 * A file we wrote entirely may be rewritten freely; anything else needs a yes.
 */
async function planMarkdownBlock(root, rel, body, reason) {
  const abs = path.join(root, rel);
  if (!(await exists(abs))) {
    // Wrap in markers on creation too: an unwrapped create would leave the
    // file un-"fully managed" from birth, so a second :init would forever
    // (spuriously) ask for consent to touch a file we wrote entirely.
    return { kind: 'create', path: rel, reason, needsConsent: false, body: upsertBlock('', body) };
  }
  const content = await readFile(abs, 'utf8');
  return {
    kind: 'update-block',
    path: rel,
    reason,
    needsConsent: !isFullyManaged(content),
    body,
  };
}

const CLAUDE_MD_BODY = '@AGENTS.md';

// Exported so log-apply.mjs can recreate this exact header when it appends the
// first entry to a challenges.md that doesn't exist yet -- one source of truth
// for the literal instead of two copies drifting apart.
export const CHALLENGES_HEADER = '# Challenges\n\nIssues hit during the build, newest last.\n';

const AGENTS_MD_BODY = [
  '## win-hackathon',
  '',
  'This project is managed by the win-hackathon plugin.',
  'Run `/win-hackathon:status` to see the current phase, or `/win-hackathon:next` to continue.',
  'Phase state lives in `.hackathon/state.json` — treat it as the source of truth.',
].join('\n');

export async function planInit(root) {
  const env = await detectEnvironment(root);
  const actions = [];
  const warnings = [];

  if (!env.hasOurState) {
    actions.push({
      kind: 'mkdir', path: HACKATHON_DIR, needsConsent: false,
      reason: 'workshop directory for phase artifacts and state',
    });
    actions.push({
      kind: 'create', path: `${HACKATHON_DIR}/state.json`, needsConsent: false,
      reason: 'phase state, re-injected each session so /clear is free',
    });
  }
  // challenges.md and decisions.md are gated on their own existence, not on
  // hasOurState: hasOurState only reflects state.json, so a crashed-or-reset
  // :init could otherwise leave these two behind and this planner would
  // silently propose overwriting them. If either already exists, propose no
  // action for it at all — we own the whole file, so there's nothing to
  // merge, and "leave it alone" is the only non-destructive option.
  if (!(await exists(path.join(root, `${HACKATHON_DIR}/challenges.md`)))) {
    actions.push({
      kind: 'create', path: `${HACKATHON_DIR}/challenges.md`, needsConsent: false,
      body: CHALLENGES_HEADER,
      reason: 'running issues log, assembled into the Devpost submission',
    });
  }
  if (!(await exists(path.join(root, `${HACKATHON_DIR}/decisions.md`)))) {
    actions.push({
      kind: 'create', path: `${HACKATHON_DIR}/decisions.md`, needsConsent: false,
      body: '# Decisions\n\nWhat was chosen, what was rejected, and why.\n',
      reason: 'decision record feeding the README rationale',
    });
  }

  actions.push(await planMarkdownBlock(
    root, 'AGENTS.md', AGENTS_MD_BODY,
    'tells agents where phase state lives',
  ));
  actions.push(await planMarkdownBlock(
    root, 'CLAUDE.md', CLAUDE_MD_BODY,
    'points Claude Code at AGENTS.md',
  ));

  if (!env.isGitRepo) {
    actions.push({
      kind: 'git-init', path: '.', needsConsent: true,
      reason: 'phase state should be versioned so you can switch devices mid-hackathon',
    });
  }

  if (env.isDirty) {
    warnings.push(
      'Worktree has uncommitted changes. Consider committing or stashing before init writes files.',
    );
  }
  if (env.mode === 'adopt') {
    warnings.push(
      `Existing agent config found (${env.foreignAgentFiles.join(', ')}). ` +
      'Additions are confined to win-hackathon marker blocks; content outside them is untouched.',
    );
  }
  if (env.mode === 'retrofit') {
    warnings.push(
      'Existing source detected with no plugin state. All phases start at not_started — ' +
      'review .hackathon/state.json and update phase statuses to reflect what already ' +
      'exists before running :next.',
    );
  }

  return { env, actions, warnings };
}
