import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';

/**
 * The real package. The bare `openspec` name on npm is an unrelated squatted 0.0.0 stub —
 * never invoke it.
 */
export const OPENSPEC_PACKAGE = '@fission-ai/openspec';

const CHANGES_DIR = 'openspec/changes';

function defaultExec(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: 120_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

const exists = async (p) => access(p).then(() => true).catch(() => false);

export function renderProposal(feature, architecture) {
  const refs = new Set(feature.component_refs ?? []);
  const components = (architecture?.components ?? []).filter((c) => refs.has(c.id));

  const out = [];
  out.push(`# ${feature.title}`);
  out.push('');
  out.push('## Why');
  out.push('');
  out.push(`${feature.user_story.as_a} needs ${feature.user_story.i_want}, so that ` +
    `${feature.user_story.so_that}.`);
  out.push('');
  out.push('## What changes');
  out.push('');
  for (const c of components) out.push(`- \`${c.id}\` — ${c.label}: ${c.what_it_does}`);
  out.push('');
  for (const r of feature.requirements ?? []) out.push(`- **${r.id}** — ${r.statement}`);
  out.push('');
  out.push('## Verification');
  out.push('');
  for (const s of feature.scenarios ?? []) {
    out.push(`- \`${s.id}\` ${s.name} — see \`features/${feature.slug}.feature\``);
  }
  out.push('');
  return out.join('\n');
}

export async function runOpenspec(root, requirements, architecture, { exec = defaultExec, dryRun = false } = {}) {
  const musts = (requirements.features ?? []).filter((f) => f.priority === 'must');
  const artifacts = musts.map((f) => `${CHANGES_DIR}/${f.slug}/proposal.md`);
  const command = `npx --yes ${OPENSPEC_PACKAGE} validate`;

  if (dryRun) {
    // 'written' is the only value the status contract allows here — nothing has failed, so
    // 'deferred' would be wrong too — but nothing is actually on disk yet on a dry run. Pairing
    // it with a reason keeps 'written' from reading as a completed-action claim to anything
    // downstream that surfaces this object during a preview.
    return {
      status: 'written',
      artifacts,
      command,
      reason: 'dry run — nothing has been written yet; these are the paths that would be created.',
    };
  }

  const run = async (args) => {
    try {
      return await exec('npx', ['--yes', OPENSPEC_PACKAGE, ...args], { cwd: root });
    } catch (err) {
      // A spawn failure is the same situation as a missing binary: defer, do not crash.
      return { code: 127, stdout: '', stderr: err.message };
    }
  };

  if (!(await exists(path.join(root, 'openspec')))) {
    const init = await run(['init']);
    if (init.code !== 0) {
      return {
        status: 'deferred', artifacts: [], command,
        reason: `${OPENSPEC_PACKAGE} could not be reached (its \`init\` subcommand exited ${init.code}: ` +
          `${(init.stderr || init.stdout).trim() || 'no output'}). The other three surfaces were written.`,
      };
    }
  }

  for (const f of musts) {
    const dir = path.join(root, CHANGES_DIR, f.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'proposal.md'), renderProposal(f, architecture), 'utf8');
  }

  const validated = await run(['validate']);
  if (validated.code !== 0) {
    return {
      status: 'deferred', artifacts, command,
      reason: `The \`validate\` subcommand of ${OPENSPEC_PACKAGE} exited ${validated.code}: ` +
        `${(validated.stderr || validated.stdout).trim() || 'no output'}. ` +
        'The proposals are on disk — inspect and fix them, then re-run the command above.',
    };
  }

  return { status: 'written', artifacts, command };
}
