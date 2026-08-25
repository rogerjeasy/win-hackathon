/**
 * Applies a validated architecture.json to the project: renders all eight artifacts and
 * writes them, backing up any of them that already exists on disk first — not just the
 * two that are conventionally hand-edited. `docs/architecture.md` and its siblings are
 * judge-facing and the architecture-diagramming skill explicitly anticipates users editing
 * them, so a hand edit there deserves the same protection as a hand-edited AGENTS.md.
 *
 * Ordering is deliberate and load-bearing. renderAgentsMd() can throw — upsertBlock()
 * refuses to touch a hand-mangled AGENTS.md with an orphaned marker rather than silently
 * eating content between markers. That render call therefore happens in the "compute
 * everything in memory" phase, before the write loop and before any backup is taken. If it
 * throws, the error propagates unchanged and the filesystem is exactly as it was: no
 * artifact written, no backup made, no state moved. Validation runs first for the same
 * reason — an invalid payload must be refused before a single byte is written. The
 * project precondition is checked there too — writeState() would eventually refuse a
 * `state.project` that :describe never populated, but only after every artifact is
 * already on disk, which is exactly the half-written state this ordering avoids.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  HACKATHON_DIR, ARCHITECTURE_FILE, statePath, timestamp,
} from './paths.mjs';
import { readState, writeState, migrateStateFile, requireDescribedProject } from './state.mjs';
import { backupFile } from './backup.mjs';
import { validateArchitecture } from './architecture-schema.mjs';
import { layout } from './layout.mjs';
import { emitMermaid } from './emit-mermaid.mjs';
import { emitSvg } from './emit-svg.mjs';
import { emitDrawio } from './emit-drawio.mjs';
import { renderArchitecture } from './render-architecture.mjs';
import { renderDataModel } from './render-data-model.mjs';
import { renderAgentsMd, renderClaudeMd } from './render-agents.mjs';

async function readIfPresent(p) {
  return readFile(p, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });
}

export async function applyArchitecture(root, architecture, { stack, dryRun = false } = {}) {
  const { valid, errors } = validateArchitecture(architecture, stack);
  if (!valid) {
    throw new Error(`refusing to apply an invalid architecture payload:\n  ${errors.join('\n  ')}`);
  }

  await migrateStateFile(root);
  const state = await readState(root);
  if (state === null) {
    throw new Error(`no state at ${statePath(root)} — run /win-hackathon:init first`);
  }
  requireDescribedProject(state, root);

  // --- Compute every artifact body in memory first. Nothing below this point touches the
  // filesystem for a write; if any render call throws (renderAgentsMd on an orphaned
  // marker, in particular) we bail out having written nothing at all. ---
  const laidOut = layout(architecture);
  const [agentsExisting, claudeExisting] = await Promise.all([
    readIfPresent(path.join(root, 'AGENTS.md')),
    readIfPresent(path.join(root, 'CLAUDE.md')),
  ]);

  // relPath -> body. Order is only cosmetic; the write loop handles directories.
  const files = new Map([
    [`${HACKATHON_DIR}/${ARCHITECTURE_FILE}`, `${JSON.stringify(architecture, null, 2)}\n`],
    ['docs/architecture.md', renderArchitecture(architecture)],
    ['docs/data-model.md', renderDataModel(architecture, stack)],
    ['docs/assets/architecture.mmd', emitMermaid(architecture, laidOut)],
    ['docs/assets/architecture.svg', emitSvg(architecture, laidOut)],
    ['docs/assets/architecture.drawio', emitDrawio(architecture, laidOut)],
    ['AGENTS.md', renderAgentsMd(agentsExisting, architecture, stack)],
    ['CLAUDE.md', renderClaudeMd(claudeExisting)],
  ]);

  const artifacts = [...files.keys()];
  if (dryRun) return { artifacts, backedUp: [], skipped: [] };

  // --- Everything below is the write phase. Every body above rendered successfully, so
  // it is now safe to touch disk. ---
  const stamp = timestamp();
  const backedUp = [];
  for (const rel of artifacts) {
    const saved = await backupFile(root, rel, stamp);
    if (saved !== null) backedUp.push(rel);
  }

  for (const [rel, body] of files) {
    const target = path.join(root, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, 'utf8');
  }

  const next = {
    ...state,
    project: {
      ...state.project,
      architecture_ref: `${HACKATHON_DIR}/${ARCHITECTURE_FILE}`,
    },
    phases: {
      ...state.phases,
      architect: { ...state.phases.architect, status: 'awaiting_approval', artifacts },
    },
  };
  await writeState(root, next);

  return { artifacts, backedUp, skipped: [] };
}
