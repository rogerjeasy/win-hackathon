import { access } from 'node:fs/promises';
import path from 'node:path';
import { readState } from './state.mjs';
import { PHASES } from './paths.mjs';

async function missingArtifacts(root, artifacts = []) {
  const missing = [];
  for (const rel of artifacts) {
    try {
      await access(path.join(root, rel));
    } catch {
      missing.push(rel);
    }
  }
  return missing;
}

export async function resolveNext(root) {
  const state = await readState(root);
  if (state === null) {
    return {
      outcome: 'init', phase: null, drift: [],
      reason: 'No .hackathon/state.json found. Run /win-hackathon:init first.',
    };
  }

  // Drift check first: reality outranks the record.
  const drift = [];
  for (const name of PHASES) {
    const phase = state.phases[name];
    if (phase?.status !== 'approved') continue;
    const missing = await missingArtifacts(root, phase.artifacts);
    if (missing.length > 0) drift.push({ phase: name, missing });
  }
  if (drift.length > 0) {
    const summary = drift
      .map((d) => `${d.phase} is approved but ${d.missing.join(', ')} is missing`)
      .join('; ');
    return {
      outcome: 'drift', phase: drift[0].phase, drift,
      reason: `State disagrees with the filesystem: ${summary}. Resolve this before continuing.`,
    };
  }

  for (const name of PHASES) {
    if (state.phases[name]?.status === 'awaiting_approval') {
      return {
        outcome: 'awaiting_approval', phase: name, drift: [],
        reason: `Phase "${name}" is waiting on your approval. Nothing advances until you decide.`,
      };
    }
  }

  for (const name of PHASES) {
    const phase = state.phases[name];
    if (phase?.status === 'in_progress') {
      const note = phase.resume_note ? ` Where we left off: ${phase.resume_note}` : '';
      return {
        outcome: 'resume', phase: name, drift: [],
        reason: `Phase "${name}" is in progress.${note}`,
      };
    }
  }

  for (const name of PHASES) {
    const status = state.phases[name]?.status;
    if (status !== 'approved' && status !== 'skipped') {
      return {
        outcome: 'start', phase: name, drift: [],
        reason: `Phase "${name}" is next; every phase before it is resolved.`,
      };
    }
  }

  return {
    outcome: 'complete', phase: null, drift: [],
    reason: 'Every phase is resolved. Try /win-hackathon:check or /win-hackathon:status.',
  };
}
