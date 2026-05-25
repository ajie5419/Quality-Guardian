import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { listMasterDataGovernanceFields } from '../utils/master-data-governance-registry';

type BacklogStatus = 'deferred' | 'excluded' | 'planned';
type ExcludedCategory =
  | 'business_excluded'
  | 'canonical_source'
  | 'covered_by_governance'
  | 'other'
  | 'system_metadata';

interface BacklogDecision {
  key: string;
  note: string;
  status: BacklogStatus;
}

interface ModelField {
  field: string;
  model: string;
  type: string;
}

export interface ExcludedBreakdown {
  business_excluded: number;
  canonical_source: number;
  covered_by_governance: number;
  system_metadata: number;
  other: number;
}

export interface BacklogPendingItem {
  decisionNote: null | string;
  decisionStatus: 'undecided' | BacklogStatus;
  field: string;
  key: string;
  model: string;
  status: 'undecided' | BacklogStatus;
  type: string;
}

export interface BacklogReport {
  backlogConfig: {
    decisionCount: number;
    path: string;
    updatedAt: null | string;
    version: number;
  };
  generatedAt: string;
  pending: BacklogPendingItem[];
  reportLabel: string;
  statusBreakdown: {
    deferred: number;
    excluded: number;
    planned: number;
  };
  summary: {
    actionablePendingFields: number;
    decisionCoverage: number;
    excludedBreakdown: ExcludedBreakdown;
    governedFields: number;
    pendingFields: number;
    semanticFields: number;
    undecidedFields: number;
  };
  undecided: BacklogPendingItem[];
}

export interface BuildBacklogReportOptions {
  reportLabel: string;
  repoRoot: string;
}

const SCALAR_TYPES = new Set([
  'BigInt',
  'Boolean',
  'Bytes',
  'DateTime',
  'Decimal',
  'Float',
  'Int',
  'Json',
  'String',
]);

const SEMANTIC_KEYWORDS = [
  'name',
  'team',
  'department',
  'dept',
  'division',
  'project',
  'part',
  'process',
  'type',
  'subtype',
  'category',
  'supplier',
  'customer',
  'reason',
  'cause',
];

const EXCLUDED_PREFIXES = [
  'created',
  'updated',
  'deleted',
  'isDeleted',
  'status',
];

const EXCLUDED_EXACT_FIELDS = new Set([
  'bizType',
  'contentType',
  'fieldName',
  'id',
  'mimeType',
  'originalName',
  'scopeType',
  'sourceFileName',
  'storedName',
  'tableName',
  'targetType',
]);

function slugify(input: string) {
  return String(input || '')
    .trim()
    .replaceAll(/[^\w-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const [key, value = ''] = item.slice(2).split('=');
    args.set(key, value);
  }
  return args;
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'on', 'true', 'y', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'n', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

function isSemanticFieldName(fieldName: string) {
  const lowered = fieldName.toLowerCase();
  return SEMANTIC_KEYWORDS.some((item) => lowered.includes(item));
}

function parseSchemaModelFields(schemaText: string) {
  const fields: ModelField[] = [];
  const modelMatches = schemaText.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g);
  for (const modelMatch of modelMatches) {
    const model = String(modelMatch[1] || '').trim();
    const body = String(modelMatch[2] || '');
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const match = line.match(/^(\w+)\s+([\w?[\]]+)/);
      if (!match) continue;
      const field = String(match[1] || '').trim();
      const typeRaw = String(match[2] || '').trim();
      const type = typeRaw.replaceAll(/[?[\]]/g, '');
      if (!SCALAR_TYPES.has(type)) continue;
      fields.push({ model, field, type });
    }
  }
  return fields;
}

function isExcludedByRule(field: ModelField) {
  if (EXCLUDED_EXACT_FIELDS.has(field.field)) return true;
  if (field.field.endsWith('Id')) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => field.field.startsWith(prefix))) {
    return true;
  }
  return false;
}

function createEmptyExcludedBreakdown(): ExcludedBreakdown {
  return {
    business_excluded: 0,
    canonical_source: 0,
    covered_by_governance: 0,
    system_metadata: 0,
    other: 0,
  };
}

export function classifyExcludedByDecisionNote(note: string): ExcludedCategory {
  const normalizedNote = String(note || '')
    .trim()
    .toLowerCase();

  if (!normalizedNote) return 'other';

  if (
    normalizedNote.includes('covered by governance field') ||
    normalizedNote.includes('covered by governance')
  ) {
    return 'covered_by_governance';
  }

  if (
    normalizedNote.includes('canonical source') ||
    normalizedNote.includes('canonical source entity') ||
    normalizedNote.includes('primary label')
  ) {
    return 'canonical_source';
  }

  if (
    normalizedNote.includes('metadata') ||
    normalizedNote.includes('iam ') ||
    normalizedNote.includes('iam profile') ||
    normalizedNote.includes('iam identity') ||
    normalizedNote.includes('rbac') ||
    normalizedNote.includes('authorization policy') ||
    normalizedNote.includes('audit/login')
  ) {
    return 'system_metadata';
  }

  if (
    normalizedNote.includes('business-excluded') ||
    normalizedNote.includes('business excluded') ||
    normalizedNote.includes('rollout scope') ||
    normalizedNote.includes('canonicalization value is low') ||
    normalizedNote.includes('out of') ||
    normalizedNote.includes('out-of')
  ) {
    return 'business_excluded';
  }

  return 'other';
}

export function summarizeExcludedBreakdown(notes: string[]): ExcludedBreakdown {
  const result = createEmptyExcludedBreakdown();
  for (const note of notes) {
    const category = classifyExcludedByDecisionNote(note);
    result[category] += 1;
  }
  return result;
}

async function readBacklogDecisions(repoRoot: string) {
  const configPath = path.resolve(
    repoRoot,
    'apps',
    'backend',
    'config',
    'master-data-governance-backlog.json',
  );
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content) as {
      decisions?: BacklogDecision[];
      updatedAt?: string;
      version?: number;
    };
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    return {
      configPath,
      decisions,
      version: Number(parsed.version || 1),
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return {
      configPath,
      decisions: [] as BacklogDecision[],
      version: 1,
      updatedAt: '',
    };
  }
}

export async function buildMasterDataGovernanceBacklogReport(
  options: BuildBacklogReportOptions,
) {
  const schemaPath = path.resolve(
    options.repoRoot,
    'apps',
    'backend',
    'prisma',
    'schema.prisma',
  );

  const schemaText = await fs.readFile(schemaPath, 'utf8');
  const schemaFields = parseSchemaModelFields(schemaText)
    .filter((field) => isSemanticFieldName(field.field))
    .filter((field) => !isExcludedByRule(field));

  const governedTargets = new Set(
    listMasterDataGovernanceFields().flatMap((item) =>
      item.targets.map((target) => `${target.table}.${target.nameColumn}`),
    ),
  );
  const canonicalSourceFields = new Set(
    listMasterDataGovernanceFields()
      .filter((item) => Boolean(item.canonical))
      .map((item) =>
        item.canonical
          ? `${item.canonical.table}.${item.canonical.nameColumn}`
          : '',
      )
      .filter(Boolean),
  );

  const backlogConfig = await readBacklogDecisions(options.repoRoot);
  const decisionByKey = new Map(
    backlogConfig.decisions
      .map((item) => ({
        key: String(item.key || '').trim(),
        status: item.status,
        note: String(item.note || '').trim(),
      }))
      .filter(
        (item): item is { key: string; note: string; status: BacklogStatus } =>
          Boolean(item.key) &&
          ['deferred', 'excluded', 'planned'].includes(item.status),
      )
      .map((item) => [item.key, item]),
  );

  const pending = schemaFields
    .map((field) => ({
      key: `${field.model}.${field.field}`,
      model: field.model,
      field: field.field,
      type: field.type,
    }))
    .filter(
      (item) =>
        !governedTargets.has(item.key) && !canonicalSourceFields.has(item.key),
    )
    .map((item): BacklogPendingItem => {
      const decision = decisionByKey.get(item.key);
      return {
        ...item,
        status: decision?.status ?? 'undecided',
        decisionStatus: decision?.status ?? 'undecided',
        decisionNote: decision?.note || null,
      };
    });

  const undecided = pending.filter((item) => item.status === 'undecided');

  const byStatus = {
    planned: pending.filter((item) => item.status === 'planned'),
    deferred: pending.filter((item) => item.status === 'deferred'),
    excluded: pending.filter((item) => item.status === 'excluded'),
  };
  const excludedDecisionNotes = byStatus.excluded.map(
    (item) => item.decisionNote || '',
  );
  const excludedBreakdown = summarizeExcludedBreakdown(excludedDecisionNotes);

  const report: BacklogReport = {
    generatedAt: new Date().toISOString(),
    reportLabel: options.reportLabel,
    summary: {
      semanticFields: schemaFields.length,
      governedFields: schemaFields.length - pending.length,
      pendingFields: pending.length,
      undecidedFields: undecided.length,
      actionablePendingFields:
        byStatus.planned.length + byStatus.deferred.length + undecided.length,
      decisionCoverage:
        pending.length === 0
          ? 1
          : (pending.length - undecided.length) / pending.length,
      excludedBreakdown,
    },
    backlogConfig: {
      path: backlogConfig.configPath,
      version: backlogConfig.version,
      updatedAt: backlogConfig.updatedAt || null,
      decisionCount: backlogConfig.decisions.length,
    },
    statusBreakdown: {
      planned: byStatus.planned.length,
      deferred: byStatus.deferred.length,
      excluded: byStatus.excluded.length,
    },
    undecided,
    pending,
  };

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportLabel = slugify(args.get('reportLabel') || 'manual') || 'manual';
  const allowUndecided = parseBool(args.get('allowUndecided'), false);
  const requireDeferredZero = parseBool(args.get('requireDeferredZero'), false);
  const requirePlannedZero = parseBool(args.get('requirePlannedZero'), false);
  const requireDecisionCoverageOne = parseBool(
    args.get('requireDecisionCoverageOne'),
    false,
  );
  const repoRoot = resolveRepoRoot();
  const report = await buildMasterDataGovernanceBacklogReport({
    repoRoot,
    reportLabel,
  });

  const outDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'backlog',
  );
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `backlog-report-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${reportLabel}.json`,
  );
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.warn('[export-master-data-governance-backlog] result');
  console.warn(
    JSON.stringify(
      {
        summary: report.summary,
        statusBreakdown: report.statusBreakdown,
        outPath,
      },
      null,
      2,
    ),
  );

  if (!allowUndecided && report.undecided.length > 0) {
    process.exitCode = 1;
  }
  if (requirePlannedZero && report.statusBreakdown.planned > 0) {
    process.exitCode = 1;
  }
  if (requireDeferredZero && report.statusBreakdown.deferred > 0) {
    process.exitCode = 1;
  }
  if (requireDecisionCoverageOne && report.summary.decisionCoverage < 1) {
    process.exitCode = 1;
  }
}

const currentModulePath = fileURLToPath(import.meta.url);
const isCliEntry =
  process.argv[1] && path.resolve(process.argv[1]) === currentModulePath;

if (isCliEntry) {
  main().catch((error: unknown) => {
    console.error('[export-master-data-governance-backlog] failed', error);
    process.exitCode = 1;
  });
}
