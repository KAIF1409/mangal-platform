// Generates documentation from this audit's local, ignored metadata/check logs.
// No network, credentials, or application data are read by this script.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(resolve(root, name), 'utf8');
const schema = JSON.parse(read('.audit-schema-normalized.log'));
const details = JSON.parse(read('.audit-db-details-normalized.log'));
const lint = JSON.parse(read('.audit-lint.json'));
const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');

const db = [
  '# Live schema and RLS inventory — 2026-09-07',
  '',
  'Read-only catalog introspection, not a restorable schema dump. No rows, keys or credentials included.',
  'Lists every retrieved public/storage table and policy. Public columns, constraints and indexes are included.',
  'RLS enabled does not prove policies correct; see AUDIT.md for blockers and untested role matrices.',
  '',
  `Tables: ${schema.tables.length}; policies: ${schema.policies.length}; public indexes: ${details.indexes.length}.`,
];
for (const table of schema.tables.toSorted((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`))) {
  db.push('', `## ${table.schema}.${table.table}`, '', `RLS enabled: ${table.rls}; forced: ${table.force_rls}.`, '');
  const columns = schema.columns.filter(c => table.schema === 'public' && c.table === table.table);
  if (columns.length) db.push('Columns: ' + columns.map(c => `\`${c.column}\` (${c.type})`).join(', '), '');
  db.push('| Policy | Command | Roles | Using | With check |', '|---|---|---|---|---|');
  for (const policy of schema.policies.filter(p => p.schemaname === table.schema && p.tablename === table.table)) {
    db.push(`| ${cell(policy.policyname)} | ${policy.cmd} | ${policy.roles.join(', ')} | ${cell(policy.qual)} | ${cell(policy.with_check)} |`);
  }
  if (table.schema === 'public') {
    db.push('', 'Constraints:', ...details.constraints.filter(c => c.table === table.table).map(c => `- ${cell(c.definition)}`));
    db.push('', 'Indexes:', ...details.indexes.filter(i => i.tablename === table.table).map(i => `- ${cell(i.indexdef)}`));
  }
}
db.push('', '## Public SECURITY DEFINER function ACLs', '',
  'An ACL entry starting `=X/` grants EXECUTE to PUBLIC (including anon/authenticated).',
  'This is a triage inventory, not certification of each function body.', '');
for (const fn of details.functions.filter(f => f.definition.includes('SECURITY DEFINER'))) {
  db.push(`- **${fn.name}**: ${cell(JSON.stringify(fn.acl))}`);
}
writeFileSync(resolve(root, 'docs/AUDIT_DATABASE.md'), db.join('\n') + '\n');

const diagnostics = ['# Lint diagnostic inventory — 2026-09-07', '',
  'Post-fix ESLint output, retained individually rather than suppressed.', '',
  '| File | Line | Severity | Rule | Diagnostic |', '|---|---|---|---|---|'];
for (const result of lint) {
  for (const message of result.messages) {
    diagnostics.push(`| ${cell(relative(root, result.filePath).replaceAll('\\', '/'))} | ${message.line ?? ''} | ${message.severity === 2 ? 'error' : 'warning'} | ${cell(message.ruleId)} | ${cell(message.message)} |`);
  }
}
writeFileSync(resolve(root, 'docs/AUDIT_DIAGNOSTICS.md'), diagnostics.join('\n') + '\n');

const perf = {};
for (const stage of ['before', 'after']) {
  perf[stage] = read(`.audit-perf-${stage}.log`).split(/\r?\n/)
    .filter(line => line.startsWith('AUDIT_METRICS '))
    .map(line => JSON.parse(line.slice('AUDIT_METRICS '.length)));
}
writeFileSync(resolve(root, 'docs/AUDIT_PERFORMANCE.json'), JSON.stringify(perf, null, 2) + '\n');

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(relative(root, path).replaceAll('\\', '/'));
  }
}
walk(resolve(root, 'src/app'));
const routes = files.filter(p => /\/(page|route|layout|loading|error|not-found)\.tsx?$/.test(p));
writeFileSync(resolve(root, 'docs/AUDIT_ROUTES.md'), [
  '# App Router inventory — 2026-09-07', '',
  'Presence/inventory only. Files listed here have NOT all been behaviorally audited.',
  'The audit prioritizes shared security boundaries and WebMangal. KaTube/K Circle full flow audits remain open.', '',
  ...routes.toSorted().map(p => `- \`${p}\``), '',
  '## Components and shared logic', '',
  ...files.filter(p => p.includes('/components/') || p.includes('/lib/')).toSorted().map(p => `- \`${p}\``), '',
].join('\n'));
console.log('Generated database, diagnostics, performance and route evidence documents.');