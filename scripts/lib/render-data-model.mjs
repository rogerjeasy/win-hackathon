/**
 * Renders docs/data-model.md from an architecture payload, optionally a stack payload.
 *
 * Follows Kintwadi's twelve-section shape: title, the opening argument for this model, design
 * principles, the entity-relationship diagram, the entity catalog (grouped), transactions and
 * integrity, the RBAC capability matrix, access control in one sentence, policy design,
 * indexing and performance, why this database for this model, and scope/forward-compatibility.
 *
 * Pure: no filesystem access. Sections whose payload field is empty are omitted rather than
 * emitted as bare headings. Every table is built through renderTable() so free-text fields
 * (entity purposes, policy rules, capability lists) can never contain a stray '|' that shifts
 * a judge-facing table's columns.
 */

import { renderTable } from './render.mjs';

const has = (a) => Array.isArray(a) && a.length > 0;

const CARDINALITY = {
  'one-to-many': '||--o{',
  'many-to-one': '}o--||',
  'many-to-many': '}o--o{',
  'one-to-one': '||--||',
};

export function renderDataModel(architecture, stack) {
  const a = architecture;
  const entities = a.entities ?? [];
  const ac = a.access_control ?? { model: 'none' };
  const rls = ac.model === 'rls';
  const out = [];

  out.push('# Data Model');
  out.push('');
  out.push(`> ${a.thesis_line}`);
  out.push('');

  // Unconditional: this argument exists regardless of payload shape. Named "this data model"
  // (not "this model") so it can never collide with the comparative "## Why <db> over <rejected>"
  // heading below -- both used to start "## Why this model" / "## Why ", which made the
  // no-stack case impossible to assert as absent by prefix alone.
  out.push('## Why this data model');
  out.push('');
  out.push(rls
    ? 'The access rule is per-row and relational, so the database can enforce it and the '
      + 'application cannot be the only thing that does. That is the argument this model rests on.'
    : 'The model below follows the access patterns the application actually has, rather than a '
      + 'shape chosen before the queries were known.');
  out.push('');

  out.push('## Design principles');
  out.push('');
  out.push('- Every table states whether it carries tenant data. That decides whether a policy is required.');
  out.push('- Relationships are declared, not implied by naming convention.');
  out.push('- Audit rows commit in the same transaction as the action they record, or not at all.');
  out.push('');

  if (has(entities)) {
    out.push('## Entity-relationship diagram');
    out.push('');
    out.push('```mermaid');
    out.push('erDiagram');
    for (const e of entities) {
      for (const r of e.relationships ?? []) {
        const arrow = CARDINALITY[r.kind] ?? '||--o{';
        out.push(`  ${e.name} ${arrow} ${r.to} : "${r.kind}"`);
      }
    }
    out.push('```');
    out.push('');

    out.push('## Entity catalog');
    out.push('');
    for (const group of [...new Set(entities.map((e) => e.group ?? 'other'))]) {
      out.push(`### ${group}`);
      out.push('');
      const rows = entities
        .filter((x) => (x.group ?? 'other') === group)
        .map((e) => {
          const fields = (e.fields ?? []).map((f) => `\`${f.name}\``).join(', ') || '—';
          return [`\`${e.name}\``, e.tenant_scoped ? 'yes' : 'no', e.purpose, fields];
        });
      out.push(renderTable(['Entity', 'Tenant-scoped', 'Purpose', 'Notable fields'], rows));
      out.push('');
    }
  }

  out.push('## Transactions and integrity');
  out.push('');
  out.push('State-changing actions and their audit rows share a transaction. A partial write that');
  out.push('records the action without the audit trail — or the reverse — is treated as a bug, not');
  out.push('an acceptable degradation.');
  out.push('');

  if (rls && has(ac.capability_matrix)) {
    out.push('## Role-based access control — the capability matrix');
    out.push('');
    const rows = ac.capability_matrix.map((row) =>
      [`\`${row.role}\``, (row.can ?? []).map((c) => `\`${c}\``).join(', ')]);
    out.push(renderTable(['Role', 'Can'], rows));
    out.push('');
  }

  if (rls) {
    out.push('## Access control in one sentence');
    out.push('');
    out.push(`Every query runs inside a transaction that has set \`${ac.session_context}\`, and every`);
    out.push('tenant-scoped table has a policy that reads it — so a query with no session context');
    out.push('returns nothing rather than everything.');
    out.push('');

    if (has(ac.policies)) {
      out.push('## Policy design');
      out.push('');
      const rows = ac.policies.map((p) =>
        [`\`${p.id}\``, (p.applies_to ?? []).map((t) => `\`${t}\``).join(', '), p.rule]);
      out.push(renderTable(['Policy', 'Applies to', 'Rule'], rows));
      out.push('');
    }
  }

  out.push('## Indexing and performance');
  out.push('');
  out.push('Index the columns the policies filter on first — a policy that forces a sequential scan');
  out.push('turns every read into a table scan. Then index the demo path.');
  out.push('');

  const db = (stack?.slots ?? []).find((s) => /database|datastore/i.test(s?.id ?? ''));
  const rejectedDb = (stack?.rejected ?? []).find((r) => r?.slot === db?.id) ?? (stack?.rejected ?? [])[0];
  if (db && rejectedDb) {
    out.push(`## Why ${db.choice} over ${rejectedDb.choice} *for this model*`);
    out.push('');
    out.push(db.rationale);
    out.push('');
    out.push(`**${rejectedDb.choice} was rejected:** ${rejectedDb.why_not}`);
    out.push('');
  }

  out.push('## Scope and forward-compatibility');
  out.push('');
  out.push('This model covers what the hackathon build needs. Anything beyond it is named here');
  out.push('rather than half-built: additions should extend the entity catalog above, and any new');
  out.push('tenant-scoped table needs a policy in the same change.');
  out.push('');

  return out.join('\n');
}
