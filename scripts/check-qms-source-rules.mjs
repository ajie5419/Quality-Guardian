#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const CHINESE_TEXT_PATTERN = /[\u3400-\u9FFF]/u;
const TEST_FILE_PATTERN =
  /(?:^|\/)(?:__tests__|test|tests)\/|\.(?:spec|test)\.[cm]?[jt]sx?$/u;
const ID_NAME_PATTERN = /^(?:id|.*(?:Id|ID|_id))$/u;
const ERROR_LOG_FUNCTIONS = new Set([
  'logApiError',
  'logApiWarn',
  'logDatabaseError',
]);
const INSPECTION_CHANGED_EVENTS = new Set([
  'after_sales.changed',
  'inspection_issue.changed',
  'inspection_record.changed',
]);
const CONTROLLED_SUPPLIER_MODELS = new Set(['inspections', 'quality_records']);
// DataScope-protected domains (SEC-DATASCOPE-001). Files under these modules
// must never write guarded records by a bare business identifier without an
// explicit scope condition. The report domain is tracked as OUT_OF_SCOPE in
// docs/permission-module.md: its remaining bare-id writes are baselined and
// assigned to a dedicated Dashboard/Report permission special.
const PROTECTED_SCOPE_MODULES = new Set([
  'after-sales',
  'inspection',
  'quality-loss',
  'supplier',
  'task-dispatch',
  'work-order',
]);
// Analytics aggregate domains (SEC-ANALYTICS-SCOPE-001): files in these
// modules must scope every protected-model read (ORM or raw SQL) through a
// DataScope builder, a named raw-scope helper, or an explicit allow marker.
// Delegation-only services (dashboard.service / report.service) carry no
// direct reads and stay naturally clean.
const ANALYTICS_SCOPE_MODULES = new Set(['dashboard', 'report']);
// Model-level protection net: writes to these tables are guarded in ANY file
// (helpers, utils, cross-module services), not only inside the module
// directory. This closes the "move the bare write into a helper" escape hatch.
const PROTECTED_PRISMA_MODELS = new Set([
  'after_sales',
  'inspections',
  'qms_task_dispatches',
  'quality_loss_index',
  'quality_losses',
  'reports',
  'suppliers',
  'work_orders',
]);
// Module-level guard applies to these models when the file lives in a
// protected module directory. Internal job/config tables that are already
// baselined (inspection_archive_tasks / inspection_form_templates) stay
// guarded so their LEGACY entries keep being enforced; pure internal tables
// (doc_projects, qms_inspection_request_inspections, ...) are intentionally
// not listed to avoid false positives on maintenance-only writes.
const MODULE_GUARDED_MODELS = new Set([
  'inspection_archive_tasks',
  'inspection_form_templates',
  'qms_inspection_material_requests',
  'qms_inspection_requests',
  'quality_records',
  ...PROTECTED_PRISMA_MODELS,
]);
// Business tables whose aggregate reads inside analytics modules must be
// scoped. Kept to row-level-authorization domains; internal/job/config tables
// (projection tables, system_settings, sequences, ...) are not listed so
// maintenance reads do not produce false positives.
const ANALYTICS_READ_MODELS = new Set([
  'after_sales',
  'inspections',
  'qms_task_dispatches',
  'quality_loss_index',
  'quality_losses',
  'quality_records',
  'suppliers',
  'work_orders',
]);
// Stats-file aggregate-read protection for protected scope modules
// (SEC-INSPECTION-REQUEST-ANALYTICS-001). Applied narrowly: only files whose
// name contains stats/statistics inside these modules must scope the listed
// models' aggregate reads. Ordinary list/CRUD services keep their own
// write-oriented guards and are not affected. Extend the map per module when
// a new stats file aggregates a row-level-authorization table.
const STATS_AGGREGATE_READ_GUARD = new Map([
  ['inspection', new Set(['qms_inspection_requests'])],
]);
const STATS_FILE_PATTERN = /stats|statistics/u;
// Bounded-read invariants (PERF-QMS-001 / PHASE-1A): the confirmed high-risk
// list/export entries must paginate or bound rows in the database. The rule is
// deliberately file + function scoped so ordinary aggregates, maintenance
// reads and unrelated modules stay untouched.
const BOUNDED_READ_INVARIANTS = [
  {
    filePattern:
      /^apps\/backend\/modules\/after-sales\/after-sales\.service\.ts$/u,
    functionName: 'getList',
    key: 'after-sales-list-db-pagination',
    message:
      'The after-sales interactive list must paginate in the database (skip + take) and never read all rows and slice in Node.',
    method: 'findMany',
    model: 'after_sales',
    requireSkip: true,
    requireTake: true,
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-record-query\.service\.ts$/u,
    functionName: 'findAllForExport',
    key: 'inspection-export-bounded-read',
    message:
      'The inspection export must read at most EXPORT_QUERY_TAKE rows (take = EXPORT_ROWS_MAX + 1); an unbounded read would load the whole table before the limit check.',
    method: 'findMany',
    model: 'inspections',
    requireTake: 'EXPORT_QUERY_TAKE',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/quality-loss\/quality-loss\.service\.ts$/u,
    functionName: 'getExportRows',
    key: 'quality-loss-export-bounded-read',
    message:
      'The quality-loss export must read at most EXPORT_QUERY_TAKE rows (take = EXPORT_ROWS_MAX + 1); loading the whole index before the limit check regresses PERF-QMS-001.',
    method: 'findMany',
    model: 'quality_loss_index',
    requireTake: 'EXPORT_QUERY_TAKE',
  },
];
// DB-aggregation invariants (PERF-QMS-001 / PHASE-1B): analytics entry
// points migrated from full findMany -> Node reduce/group to database
// aggregation must not regress back to full-row reads. Each invariant is
// file + function + model scoped so identity lookups (processes,
// dictionaries, users), bounded reads and unrelated modules stay unguarded.
const DB_AGGREGATION_INVARIANTS = [
  {
    filePattern:
      /^apps\/backend\/modules\/quality-loss\/quality-loss\.service\.ts$/u,
    functionNames: new Set([
      'getDashboardSummary',
      'getTrendData',
      'getYearlyCharts',
    ]),
    key: 'quality-loss-dashboard-db-aggregation',
    message:
      'The quality-loss dashboard/trend must aggregate in the database (aggregate/groupBy/raw SQL); loading quality_loss_index rows into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'quality_loss_index',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-issue-stats\.service\.ts$/u,
    functionNames: new Set(['getIssueChartAggregation']),
    key: 'inspection-issue-chart-db-aggregation',
    message:
      'The inspection issue chart aggregation must use groupBy/count in the database; a full quality_records findMany into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'quality_records',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/after-sales\/after-sales-chart-aggregation\.service\.ts$/u,
    functionNames: new Set(['getReportMonthAggregation']),
    key: 'after-sales-report-month-db-aggregation',
    message:
      'The after-sales reportMonth aggregation must group in the database; loading all after_sales rows into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'after_sales',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/work-order\/work-order\.service\.ts$/u,
    functionNames: new Set(['getDashboardStats']),
    key: 'work-order-dashboard-db-aggregation',
    message:
      'The work-order dashboard stats must aggregate in the database (groupBy/count); a full work_orders findMany into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'work_orders',
  },
  {
    filePattern: /^apps\/backend\/modules\/report\/pass-rate\.ts$/u,
    functionNames: new Set([
      'getLegacyInspectionPassRateSummaryByRange',
      'getLegacyPassRateDrillDownByRange',
      'getLegacyPassRateMonthlyByRange',
    ]),
    key: 'pass-rate-legacy-db-aggregation',
    message:
      'The legacy pass-rate summary/drilldown/monthly trend must aggregate in the database (raw SQL); a full inspections findMany into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'inspections',
  },
  {
    filePattern: /^apps\/backend\/modules\/dashboard\/dashboard\.service\.ts$/u,
    functionNames: new Set(['getMonthlyTrend']),
    key: 'dashboard-monthly-trend-db-aggregation',
    message:
      'The dashboard monthly trend must run one year-range database aggregation; a full inspections findMany into Node regresses PERF-QMS-001/PHASE-1B.',
    method: 'findMany',
    model: 'inspections',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-request-stats\.service\.ts$/u,
    functionNames: new Set(['getRequestStats']),
    key: 'inspection-request-stats-period-db-aggregation',
    message:
      'The inspection-request-stats period section must be DB pre-aggregated (submitted/closed GROUP BY raw SQL); a qms_inspection_requests findMany into Node regresses PERF-QMS-001/PHASE-2A.',
    method: 'findMany',
    model: 'qms_inspection_requests',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-request-stats-data\.ts$/u,
    functionNames: new Set(['loadInspectionRequestStatsData']),
    key: 'inspection-request-stats-data-db-aggregation',
    message:
      'The inspection-request-stats data loader must aggregate in the database (raw GROUP BY + count); a qms_inspection_requests findMany into Node regresses PERF-QMS-001/PHASE-2A.',
    method: 'findMany',
    model: 'qms_inspection_requests',
  },
];
const ANALYTICS_READ_METHODS = new Set([
  'aggregate',
  'count',
  'findFirst',
  'findMany',
  'findUnique',
  'groupBy',
]);
// Borrow-domain state writes (METROLOGY-BORROW-001): status transitions in the
// metrology borrow domain must be CAS keyed by the expected state (borrow:
// AVAILABLE, requestReturn: BORROWED/OVERDUE, confirmReturn: RETURN_PENDING).
// The file scope is deliberately narrow so instrument CRUD (metrology-id.put,
// imports) and calibration-plan writes stay unguarded.
const METROLOGY_BORROW_STATE_MODELS = new Set([
  'measuring_instruments',
  'metrology_borrow_records',
]);
const METROLOGY_BORROW_FILE_PATTERN =
  /^apps\/backend\/(?:api\/qms\/(?:public\/)?metrology\/borrow|modules\/metrology\/borrow)\//u;
// Supervision-domain writes (SEC-SUPERVISION-001): the four user-writable
// resources must be accessed through the shared supervision access builder
// (createdBy / project.createdBy via an opaque spread) and CAS on the expected
// status. The file scope is deliberately narrow so unrelated modules that only
// read supervision data stay unguarded.
const SUPERVISION_STATE_MODELS = new Set([
  'supervision_daily_reports',
  'supervision_issues',
  'supervision_plan_tasks',
  'supervision_projects',
]);
const SUPERVISION_FILE_PATTERN =
  /^apps\/backend\/(?:api\/qms\/supervision|modules\/supervision)\//u;
// State-machine protected models (STATE-MACHINE-001): status writes on these
// tables must be CAS-guarded on the expected current status (or carry an
// explicit scope/ownership condition). The model-level net applies in ANY file
// (helpers, utils, cross-module services) so moving a bare status write into a
// helper does not bypass the rule. create/upsert are excluded (inserts set the
// initial state, they are not transitions).
const STATE_MACHINE_PROTECTED_MODELS = new Set([
  'qms_task_dispatches',
  'quality_losses',
  'vehicle_commissioning_issues',
]);
// Close-effects inspection documents merge (CLOSE-EFFECTS-INTEGRITY-001): the
// JSON snapshot columns are merged read-compute-write, so the where clause of
// any inspections write in this file must anchor on the snapshot columns being
// merged (optimistic CAS) or an opaque scoped spread. A bare `{ id }` or a CAS
// on unrelated columns would let the find -> merge -> update lost-update
// pattern return. The file scope is deliberately one file: zero false-positive
// surface outside the close post-commit effect.
const INSPECTION_CLOSE_EFFECT_FILE_PATTERN =
  /^apps\/backend\/modules\/inspection\/inspection-request-close-effects\.service\.ts$/;
// Config-driven resource identifier fields per protected model. A write whose
// where clause is keyed by these fields (plus at most soft-delete flags) is a
// bare-identifier write. Keep this list per model, not a global catch-all, so
// ordinary batch/attribute filters (supplierId, teamId, category, ...) do not
// produce false positives.
const RESOURCE_IDENTIFIER_FIELDS = {
  inspections: ['id', 'inspectionId', 'workOrderNumber'],
  after_sales: ['id'],
  quality_loss_index: ['id', 'lossId'],
  quality_losses: ['id', 'lossId'],
  suppliers: ['id'],
  work_orders: ['id', 'workOrderNumber'],
  qms_task_dispatches: ['id', 'taskId'],
  quality_records: ['id', 'recordId'],
  qms_inspection_requests: ['id', 'requestId'],
  qms_inspection_material_requests: ['id', 'requestId'],
  inspection_archive_tasks: ['id'],
  inspection_form_templates: ['id'],
};
// Where properties that are themselves a row-level authorization constraint.
// Their presence proves the write is not a bare identifier write.
const SCOPE_OWNERSHIP_FIELDS = new Set([
  'assigneeId',
  'assignorId',
  'createdBy',
  'dispatcherId',
  'division',
  'inspector',
  'inspectorId',
  'leaseOwner',
  'leaseUntil',
  'respDept',
  'respDeptId',
  'responsibleDepartment',
  'responsibleDepartmentId',
  'source',
  'sourcePk',
  'updatedBy',
]);
// Named raw-SQL helpers that embed the resolved DataScope fragment. Raw SQL in
// protected modules must be routed through one of these (or carry an explicit
// allow marker with a reason).
const RAW_SCOPE_HELPER_PATTERN =
  /^(?:build|apply|with)[A-Z][A-Za-z0-9]*Raw(?:Scope|Ownership|Filter|Sql|Where)/u;
// Explicit allow markers. The reason after the colon is mandatory (>= 8 chars)
// so suppression without justification fails CI.
const WRITE_ALLOW_MARKER_RE = /\/\/\s*qms-arch-allow\s+R-SCOPE:\s*.{8,}/u;
const RAW_ALLOW_MARKER_RE = /\/\/\s*qms-arch-allow\s+R-SCOPE-RAW:\s*.{8,}/u;
const AGG_ALLOW_MARKER_RE = /\/\/\s*qms-arch-allow\s+R-SCOPE-AGG:\s*.{8,}/u;
// Identifiers that prove a function routes its analytics read through the
// DataScope machinery. `requireAnalyticsUser` alone is deliberately NOT an
// anchor: it only proves authentication, not row-level authorization.
const ANALYTICS_SCOPE_ANCHOR_PATTERN =
  /^(?:buildScoped[A-Za-z0-9]*Where|build[A-Za-z0-9]*RawScope(?:Sql|Where)|resolve[A-Za-z0-9]*Scope)$/u;
const ID_FIRST_SCORING_FILES = new Set([
  'apps/backend/modules/after-sales/after-sales-integration.service.ts',
  'apps/backend/modules/inspection/inspection-reporting.service.ts',
  'apps/backend/modules/supplier/supplier-score-snapshot.service.ts',
]);
const NAME_IDENTITY_QUERY_PROPERTIES = new Set([
  'supplierBrand',
  'supplierName',
  'team',
]);
const PRISMA_WRITE_METHODS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);
// Write methods guarded by R-SCOPE. create/upsert are excluded: inserts are
// not row-authorization targets, and upsert keyed by a business identifier is
// the canonical create-or-restore pattern (still reviewed case by case).
const SCOPED_WRITE_METHODS = new Set([
  'delete',
  'deleteMany',
  'update',
  'updateMany',
]);
const RAW_SQL_METHODS = new Set([
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
]);
// Legacy import adapters must be individually reviewed before their exact path
// is added here. Online business services are never exempt.
const NAME_ONLY_SUPPLIER_WRITE_ALLOWLIST = new Set([]);
const LEGACY_IDENTITY_IMPORT_ALLOWLIST = new Set([
  'apps/backend/modules/after-sales/after-sales-route.service.ts',
  'apps/backend/modules/inspection/inspection-issue.ts',
  'apps/backend/modules/inspection/inspection-record-import.post.service.ts',
  'apps/backend/modules/planning/bom-import-governance.ts',
  'apps/backend/modules/work-order/work-order-import-governance.ts',
  'apps/backend/utils/governed-write.ts',
]);
const INSPECTION_REQUEST_STATS_FILE =
  'apps/backend/modules/inspection/inspection-request-stats.service.ts';
const INSPECTION_STATS_NAME_FIELDS = new Set([
  'processName',
  'supplierName',
  'team',
]);
const DICTIONARY_SERVICE_FILE =
  'apps/backend/modules/dictionary/dictionary.service.ts';
const GUARDED_DICTIONARY_MUTATIONS = new Set(['create', 'delete', 'update']);
const TEAM_MUTATION_GUARD = 'ensureGenericMutationAllowed';
const MASTER_DATA_FIELDS_FILE = 'apps/backend/utils/master-data-fields.ts';
const MAP_KEY_METHODS = new Set(['get', 'has', 'set']);
const AMBIGUOUS_GOVERNED_NAME_FIELDS = new Set(['category', 'name', 'type']);

// Declared error codes (must stay in sync with @qgs/shared ErrorCode enum).
const DECLARED_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'BUSINESS',
  'CONFLICT',
  'DUPLICATE',
  'FORBIDDEN',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_REQUEST_IN_PROGRESS',
  'INTERNAL',
  'NOT_FOUND',
  'OPTIMISTIC_LOCK_CONFLICT',
  'UNAUTHORIZED',
  'VALIDATION',
]);

// IDEMPOTENCY-KEY-001: every P1 user-triggered create entry must route through
// the shared withRequestIdempotency helper and register its operationKey.
// Without the helper a retried / double-clicked request can create a second
// business entity even though serial numbers stay unique. PHASE-1 covered the
// quality-loss pilot; PHASE-2 extended the contract to the other P1 creates.
const IDEMPOTENCY_PROTECTED_CREATE_OPERATIONS = [
  {
    filePattern:
      /^apps\/backend\/modules\/quality-loss\/quality-loss-create\.post\.service\.ts$/,
    operationKey: 'qms.quality-loss.create',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-request-create\.post\.service\.ts$/,
    operationKey: 'qms.inspection-request.create',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/after-sales\/after-sales-create\.post\.service\.ts$/,
    operationKey: 'qms.after-sales.create',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-issue-create\.post\.service\.ts$/,
    operationKey: 'qms.inspection-nc.create',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/inspection\/inspection-record-create\.post\.service\.ts$/,
    operationKey: 'qms.inspection-record.create',
  },
  {
    filePattern:
      /^apps\/backend\/modules\/vehicle-commissioning\/vehicle-commissioning-issue-create\.post\.service\.ts$/,
    operationKey: 'qms.vehicle-commissioning-issue.create',
  },
];

function getProtectedCreateOperation(repoPath) {
  return IDEMPOTENCY_PROTECTED_CREATE_OPERATIONS.find((entry) =>
    entry.filePattern.test(repoPath),
  );
}

function parseArguments(argv) {
  const options = {
    baseline: '',
    filesFrom: '',
    identityFilesFrom: '',
    printBaseline: false,
    root: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-baseline') {
      options.printBaseline = true;
      continue;
    }
    if (
      argument === '--baseline' ||
      argument === '--files-from' ||
      argument === '--identity-files-from' ||
      argument === '--root'
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${argument}`);
      index += 1;
      if (argument === '--baseline') options.baseline = value;
      if (argument === '--files-from') options.filesFrom = value;
      if (argument === '--identity-files-from')
        options.identityFilesFrom = value;
      if (argument === '--root') options.root = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!options.filesFrom) throw new Error('--files-from is required');
  return options;
}

function loadBaseline(filePath) {
  const baseline = new Map();
  if (!filePath) return baseline;

  let content = '';
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return baseline;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/u)) {
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('|');
    if (fields.length !== 4) continue;
    const [rule, repoPath, key, countText] = fields;
    const count = Number.parseInt(countText, 10);
    if (!rule || !repoPath || !key || !Number.isInteger(count)) continue;
    baseline.set(`${rule}|${repoPath}|${key}`, count);
  }
  return baseline;
}

function getScriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function getAssertionType(node) {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return node.type;
  }
  return undefined;
}

function getPropertyNameText(name) {
  if (!name) return '';
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return '';
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isAwaitExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function findVariableInitializer(sourceFile, name) {
  let initializer;
  function visit(node) {
    if (initializer) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return initializer;
}

function resolveObjectLiteral(sourceFile, expression, seenNames = new Set()) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) return unwrapped;
  if (ts.isIdentifier(unwrapped)) {
    if (seenNames.has(unwrapped.text)) return undefined;
    const initializer = findVariableInitializer(sourceFile, unwrapped.text);
    const nextSeenNames = new Set(seenNames).add(unwrapped.text);
    return initializer
      ? resolveObjectLiteral(sourceFile, initializer, nextSeenNames)
      : undefined;
  }
  return undefined;
}

function resolveObjectLiterals(sourceFile, expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements
      .map((element) => resolveObjectLiteral(sourceFile, element))
      .filter(Boolean);
  }
  const object = resolveObjectLiteral(sourceFile, unwrapped);
  return object ? [object] : [];
}

function getObjectProperty(object, propertyName) {
  return object.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)) &&
      getPropertyNameText(property.name) === propertyName,
  );
}

function getPropertyInitializer(property) {
  if (!property) return undefined;
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

function getStringPropertyValue(object, propertyName) {
  const initializer = getPropertyInitializer(
    getObjectProperty(object, propertyName),
  );
  if (!initializer) return '';
  const value = unwrapExpression(initializer);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : '';
}

/**
 * The backend registry is the source of truth for controlled name/ID pairs.
 * Reading it through the TypeScript AST keeps architecture rules aligned with
 * the runtime governance configuration without a second handwritten list.
 */
function loadGovernedIdentityTargets(rootDir) {
  const registryPath = path.join(rootDir, MASTER_DATA_FIELDS_FILE);
  let sourceText = '';
  try {
    sourceText = readFileSync(registryPath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return new Map();
    }
    throw error;
  }

  const sourceFile = ts.createSourceFile(
    registryPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const fieldsInitializer = findVariableInitializer(
    sourceFile,
    'MASTER_DATA_FIELDS',
  );
  if (!fieldsInitializer) return new Map();

  const targetsByModel = new Map();
  for (const field of resolveObjectLiterals(sourceFile, fieldsInitializer)) {
    const targetsInitializer = getPropertyInitializer(
      getObjectProperty(field, 'targets'),
    );
    if (!targetsInitializer) continue;
    for (const target of resolveObjectLiterals(
      sourceFile,
      targetsInitializer,
    )) {
      const model = getStringPropertyValue(target, 'table');
      const nameField = getStringPropertyValue(target, 'nameColumn');
      const idField = getStringPropertyValue(target, 'idColumn');
      if (!model || !nameField || !idField) continue;
      const modelTargets = targetsByModel.get(model) ?? new Map();
      modelTargets.set(nameField, idField);
      targetsByModel.set(model, modelTargets);
    }
  }
  return targetsByModel;
}

function getGovernedNameFields(governedIdentityTargets) {
  return new Set(
    [...governedIdentityTargets.values()]
      .flatMap((modelTargets) => [...modelTargets.keys()])
      .filter((field) => !AMBIGUOUS_GOVERNED_NAME_FIELDS.has(field)),
  );
}

function isDefinitelyEmptyArray(expression) {
  if (!expression) return false;
  const unwrapped = unwrapExpression(expression);
  return (
    ts.isArrayLiteralExpression(unwrapped) && unwrapped.elements.length === 0
  );
}

function getPrismaWriteTarget(node) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !PRISMA_WRITE_METHODS.has(node.expression.name.text)
  ) {
    return undefined;
  }
  const delegate = node.expression.expression;
  if (
    !ts.isPropertyAccessExpression(delegate) ||
    !CONTROLLED_SUPPLIER_MODELS.has(delegate.name.text)
  ) {
    return undefined;
  }
  return { method: node.expression.name.text, model: delegate.name.text };
}

function getPrismaCallModel(node, methodName) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== methodName
  ) {
    return '';
  }
  const delegate = node.expression.expression;
  return ts.isPropertyAccessExpression(delegate) ? delegate.name.text : '';
}

function isEventEmitCall(node) {
  return (
    ts.isCallExpression(node) &&
    ((ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'emit') ||
      (ts.isElementAccessExpression(node.expression) &&
        ts.isStringLiteral(node.expression.argumentExpression) &&
        node.expression.argumentExpression.text === 'emit'))
  );
}

function getIdentitySourceText(filePath, sourceText) {
  if (!filePath.endsWith('.vue')) return sourceText;
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/giu;
  let masked = sourceText.replaceAll(/[^\n]/gu, ' ');
  for (const match of sourceText.matchAll(scriptPattern)) {
    const content = match[1] ?? '';
    const contentOffset = (match.index ?? 0) + match[0].indexOf(content);
    masked = `${masked.slice(0, contentOffset)}${content}${masked.slice(contentOffset + content.length)}`;
  }
  return masked;
}

function isDateNowCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Date' &&
    node.expression.name.text === 'now'
  );
}

function getElementAccessName(node) {
  if (
    !ts.isElementAccessExpression(node) ||
    !ts.isStringLiteral(node.argumentExpression)
  ) {
    return '';
  }
  return node.argumentExpression.text;
}

function containsNamedCall(node, functionName) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === functionName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function isIdGenerationTarget(node) {
  let current = node.parent;
  while (current && !ts.isStatement(current)) {
    if (
      ts.isVariableDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      ID_NAME_PATTERN.test(current.name.text)
    ) {
      return true;
    }
    if (
      ts.isPropertyAssignment(current) &&
      ID_NAME_PATTERN.test(getPropertyNameText(current.name))
    ) {
      return true;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const target = current.left;
      if (
        (ts.isIdentifier(target) && ID_NAME_PATTERN.test(target.text)) ||
        (ts.isPropertyAccessExpression(target) &&
          ID_NAME_PATTERN.test(target.name.text))
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function containsErrorLog(node) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      if (ts.isIdentifier(callee) && ERROR_LOG_FUNCTIONS.has(callee.text)) {
        found = true;
        return;
      }
      if (
        (ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee)) &&
        ((ts.isPropertyAccessExpression(callee) &&
          (callee.name.text === 'error' || callee.name.text === 'fatal')) ||
          (ts.isElementAccessExpression(callee) &&
            ts.isStringLiteral(callee.argumentExpression) &&
            (callee.argumentExpression.text === 'error' ||
              callee.argumentExpression.text === 'fatal')))
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function getModuleSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  ) {
    return node.arguments[0];
  }
  return undefined;
}

function getCurrentModule(repoPath) {
  const match = repoPath.match(/^apps\/backend\/modules\/([^/]+)\//u);
  return match?.[1] ?? '';
}

function isCrossModuleInternalImport(specifier, currentModule) {
  const match = specifier.match(/^~\/modules\/([^/]+)(?:\/(.+))?$/u);
  if (!match) return false;
  const [, targetModule, internalPath] = match;
  if (!internalPath || targetModule === currentModule) return false;
  return internalPath !== 'index' && internalPath !== 'index.ts';
}

function fingerprintText(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function getEnclosingStatement(node) {
  let current = node;
  while (current.parent) {
    if (ts.isStatement(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function getEnclosingFunction(node) {
  let current = node;
  while (current.parent) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

// Extracts the full lines spanned by [fromNode..toNode] (leading trivia of
// fromNode and trailing trivia of toNode included) so allow markers written
// above or after a statement are visible to the static checker.
function getLinesText(sourceFile, fromNode, toNode) {
  const lineStarts = sourceFile.getLineStarts();
  const start = sourceFile.getLineAndCharacterOfPosition(
    fromNode.getFullStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(toNode.getEnd());
  const startPos = lineStarts[start.line];
  const endPos = lineStarts[end.line + 1] ?? sourceFile.text.length;
  return sourceFile.text.slice(startPos, endPos);
}

function hasAllowMarker(sourceFile, node, markerRe) {
  const statement = getEnclosingStatement(node);
  if (
    statement &&
    markerRe.test(getLinesText(sourceFile, statement, statement))
  ) {
    return true;
  }
  // Function-level markers are accepted for raw SQL blocks (e.g. a sequence
  // generator function with several $queryRaw calls).
  const fn = getEnclosingFunction(node);
  return Boolean(fn && markerRe.test(getLinesText(sourceFile, fn, fn)));
}

function hasRawScopeHelperInFunction(sourceFile, node) {
  const fn = getEnclosingFunction(node);
  if (!fn) return false;
  let found = false;
  function visit(current) {
    if (found) return;
    if (
      ts.isIdentifier(current) &&
      RAW_SCOPE_HELPER_PATTERN.test(current.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(fn);
  return found;
}

// Resolves prisma.<model>.<method>, tx.<model>.<method>, options.tx.<model>.<method>
// and client.<model>.<method> call shapes into { method, model }.
function getScopedWriteTarget(node) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !SCOPED_WRITE_METHODS.has(node.expression.name.text)
  ) {
    return undefined;
  }
  const delegate = node.expression.expression;
  if (!ts.isPropertyAccessExpression(delegate)) return undefined;
  const receiver = delegate.expression;
  let receiverName = '';
  if (ts.isIdentifier(receiver)) receiverName = receiver.text;
  else if (
    ts.isPropertyAccessExpression(receiver) &&
    receiver.name.text === 'tx'
  ) {
    receiverName = 'tx';
  }
  if (!['client', 'db', 'prisma', 'tx'].includes(receiverName)) {
    return undefined;
  }
  return {
    method: node.expression.name.text,
    model: delegate.name.text,
  };
}

// Resolves prisma.<model>.<method>, tx.<model>.<method> and
// client.<model>.<method> read shapes used by analytics aggregation.
function getPrismaReadTarget(node) {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ANALYTICS_READ_METHODS.has(node.expression.name.text)
  ) {
    return undefined;
  }
  const delegate = node.expression.expression;
  if (!ts.isPropertyAccessExpression(delegate)) return undefined;
  const receiver = delegate.expression;
  let receiverName = '';
  if (ts.isIdentifier(receiver)) receiverName = receiver.text;
  else if (
    ts.isPropertyAccessExpression(receiver) &&
    receiver.name.text === 'tx'
  ) {
    receiverName = 'tx';
  }
  if (!['client', 'db', 'prisma', 'tx'].includes(receiverName)) {
    return undefined;
  }
  return {
    method: node.expression.name.text,
    model: delegate.name.text,
  };
}

function getFunctionName(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) {
    return fn.name.text;
  }
  if (ts.isMethodDeclaration(fn) && fn.name) {
    return fn.name.text;
  }
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const parent = fn.parent;
    if (
      parent &&
      ts.isPropertyAssignment(parent) &&
      parent.name &&
      ts.isIdentifier(parent.name)
    ) {
      return parent.name.text;
    }
  }
  return '';
}

// Name of the nearest enclosing NAMED function (function declaration, method
// declaration, or property-assigned arrow/function expression). Walks past
// anonymous inner closures (e.g. Array.from(..., async () => ...)) so a call
// inside a callback still resolves to the owning service method.
function getNamedEnclosingFunctionName(node) {
  let current = node;
  while (current) {
    const name = getFunctionName(current);
    if (name) return name;
    current = current.parent;
  }
  return '';
}

// Verifies a call's object-literal first argument carries the required
// bounded-read properties. `requireTake` may be `true` (any take) or the
// literal name the take initializer must reference (e.g. EXPORT_QUERY_TAKE).
function hasBoundedReadShape(sourceFile, node, invariant) {
  const args = node.arguments[0];
  if (!args || !ts.isObjectLiteralExpression(args)) return false;
  let hasSkip = false;
  let hasTake = false;
  for (const property of args.properties) {
    const name =
      property.name && ts.isIdentifier(property.name) ? property.name.text : '';
    if (name === 'skip') hasSkip = true;
    if (name !== 'take') continue;
    hasTake = true;
    if (typeof invariant.requireTake === 'string') {
      let initializer;
      if (ts.isShorthandPropertyAssignment(property)) {
        initializer = property.name;
      } else if ('initializer' in property) {
        initializer = property.initializer;
      }
      if (
        !initializer ||
        !initializer.getText(sourceFile).includes(invariant.requireTake)
      ) {
        return false;
      }
    }
  }
  if (invariant.requireSkip && !hasSkip) return false;
  if (invariant.requireTake && !hasTake) return false;
  return true;
}

// Raw SQL appears in two AST shapes: prisma.$queryRaw(Prisma.sql`...`)
// (CallExpression) and prisma.$queryRaw`...` (TaggedTemplateExpression).
// Returns the property access node carrying the raw method name, if any.
function getRawSqlTag(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    return node.expression;
  }
  if (
    ts.isTaggedTemplateExpression(node) &&
    ts.isPropertyAccessExpression(node.tag)
  ) {
    return node.tag;
  }
  return undefined;
}

// Does the enclosing function route its reads through the DataScope
// machinery (scoped where builder, named raw-scope helper, scope resolver or
// DataScopeService delegate)? Used by R-SCOPE-AGG to allow scoped aggregates.
function hasAnalyticsScopeAnchorInFunction(sourceFile, node) {
  const fn = getEnclosingFunction(node);
  if (!fn) return false;
  let found = false;
  function visit(current) {
    if (found) return;
    if (
      ts.isIdentifier(current) &&
      (ANALYTICS_SCOPE_ANCHOR_PATTERN.test(current.text) ||
        current.text === 'DataScopeService')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  }
  visit(fn);
  return found;
}

// Verdict: does the where clause of a guarded write locate rows by a bare
// business identifier without any scope/ownership/CAS condition?
function isBareIdentifierWhere(whereObj, model) {
  const identifierFields = new Set(RESOURCE_IDENTIFIER_FIELDS[model] ?? ['id']);
  const identifiers = [];
  const anchors = [];
  let hasOwnership = false;
  let hasGuard = false;
  let hasSpread = false;
  let batch = false;

  for (const property of whereObj.properties) {
    if (ts.isSpreadAssignment(property)) {
      // Opaque external where (e.g. ...buildScopedWorkOrderWhere(...)):
      // treated as scoped, matching the "scopedWhere spread" convention.
      hasSpread = true;
      continue;
    }
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const name = getPropertyNameText(property.name);
    if (!name) continue;
    if (identifierFields.has(name)) {
      identifiers.push(name);
      const value = unwrapExpression(getPropertyInitializer(property));
      if (
        ts.isObjectLiteralExpression(value) &&
        getObjectProperty(value, 'in')
      ) {
        batch = true;
      }
      continue;
    }
    if (SCOPE_OWNERSHIP_FIELDS.has(name) || name === 'OR' || name === 'AND') {
      hasOwnership = true;
      continue;
    }
    const value = unwrapExpression(getPropertyInitializer(property));
    if (ts.isObjectLiteralExpression(value)) {
      const operators = value.properties
        .map((entry) => getPropertyNameText(entry.name))
        .filter(Boolean);
      if (
        operators.some((operator) =>
          [
            'contains',
            'endsWith',
            'equals',
            'gt',
            'gte',
            'in',
            'lt',
            'lte',
            'not',
            'notIn',
            'startsWith',
          ].includes(operator),
        )
      ) {
        // Operator-form guard: CAS / explicit state-machine constraint.
        hasGuard = true;
        continue;
      }
    }
    // isDeleted is a soft-delete flag, not a scoping condition; the task
    // explicitly forbids treating `{ id, isDeleted: false }` as scoped.
    if (name !== 'isDeleted') anchors.push(name);
  }

  if (identifiers.length === 0) return false;
  if (hasOwnership || hasGuard || hasSpread) return false;
  if (batch) return anchors.length === 0;
  // Single-record identifier write: >= 2 anchor fields is the CAS / master-data
  // resolution signature; a single cosmetic extra field (`{ id, status: 'X' }`)
  // is still a bare write.
  return anchors.length < 2;
}

function analyzeWriteWhere(sourceFile, options, model) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const whereProp = getObjectProperty(options, 'where');
  if (!whereProp) return false;
  const whereValue = unwrapExpression(getPropertyInitializer(whereProp));
  if (ts.isObjectLiteralExpression(whereValue)) {
    return isBareIdentifierWhere(whereValue, model);
  }
  if (ts.isIdentifier(whereValue)) {
    const resolved = resolveObjectLiteral(sourceFile, whereValue);
    if (resolved) return isBareIdentifierWhere(resolved, model);
    // Opaque identifier where (scopedWhere / ownershipWhere): cannot prove a
    // bare write statically, treat as scoped to avoid false positives.
    return false;
  }
  // Call-valued and property-valued wheres are opaque to static analysis.
  return false;
}

// Borrow-domain verdict (METROLOGY-BORROW-001): every status transition in
// this domain is a CAS state-machine write, so the presence of a status /
// borrowStatus condition in the where clause is the CAS signature. The global
// isBareIdentifierWhere deliberately treats `{ id, status: 'X' }` as a bare
// write to stop DataScope deformations; that stricter verdict does not apply
// here because the borrow domain has an explicit state machine.
function analyzeBorrowStateWrite(sourceFile, options) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const whereProp = getObjectProperty(options, 'where');
  if (!whereProp) return false;
  const whereValue = unwrapExpression(getPropertyInitializer(whereProp));
  const hasCasCondition = (whereObj) =>
    Boolean(
      getObjectProperty(whereObj, 'status') ||
        getObjectProperty(whereObj, 'borrowStatus'),
    );
  if (ts.isObjectLiteralExpression(whereValue)) {
    return !hasCasCondition(whereValue);
  }
  if (ts.isIdentifier(whereValue)) {
    const resolved = resolveObjectLiteral(sourceFile, whereValue);
    if (resolved) return !hasCasCondition(resolved);
    // Opaque where (shared helper) cannot be proven bare statically.
    return false;
  }
  return false;
}

// Supervision-domain verdict (SEC-SUPERVISION-001): every user write must
// carry the object-level scope predicate. The shared access builder emits
// either `{ createdBy }` (project/issue/report) or `{ project: { createdBy } }`
// (task inherits the parent project scope), normally through an opaque spread.
// An explicit `createdBy`/`project` key also proves the write is scoped;
// anything else falls back to the global bare-identifier verdict so `{ id }`,
// `{ id, isDeleted: false }` and business-key writes stay flagged.
function analyzeSupervisionStateWrite(sourceFile, options, model) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const whereProp = getObjectProperty(options, 'where');
  if (!whereProp) return false;
  const whereValue = unwrapExpression(getPropertyInitializer(whereProp));
  const hasScopeCondition = (whereObj) =>
    Boolean(
      getObjectProperty(whereObj, 'createdBy') ||
        getObjectProperty(whereObj, 'project'),
    );
  if (ts.isObjectLiteralExpression(whereValue)) {
    if (hasScopeCondition(whereValue)) return false;
    return isBareIdentifierWhere(whereValue, model);
  }
  if (ts.isIdentifier(whereValue)) {
    const resolved = resolveObjectLiteral(sourceFile, whereValue);
    if (resolved) {
      if (hasScopeCondition(resolved)) return false;
      return isBareIdentifierWhere(resolved, model);
    }
    // Opaque where (shared helper / scopedWhere) cannot be proven bare.
    return false;
  }
  return false;
}

// State-machine verdict (STATE-MACHINE-001): an update/updateMany on a
// protected model that writes `status` must carry a CAS anchor — the expected
// current status (`status` in where), a scope/ownership condition, an opaque
// scoped spread, or an explicit allow marker. Without an anchor two concurrent
// requests can silently overwrite each other's transition (find -> assert ->
// update is a TOCTOU).
function analyzeStateMachineStatusWrite(sourceFile, options) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const dataProp = getObjectProperty(options, 'data');
  if (!dataProp) return false;
  const dataValue = unwrapExpression(getPropertyInitializer(dataProp));
  if (!ts.isObjectLiteralExpression(dataValue)) return false;
  if (!getObjectProperty(dataValue, 'status')) return false;

  const whereProp = getObjectProperty(options, 'where');
  if (!whereProp) return false;
  const whereValue = unwrapExpression(getPropertyInitializer(whereProp));
  const hasCasAnchor = (whereObj) => {
    if (!ts.isObjectLiteralExpression(whereObj)) return false;
    for (const property of whereObj.properties) {
      if (ts.isSpreadAssignment(property)) return true;
      if (
        !ts.isPropertyAssignment(property) &&
        !ts.isShorthandPropertyAssignment(property)
      ) {
        continue;
      }
      const name = getPropertyNameText(property.name);
      if (!name) continue;
      if (
        name === 'status' ||
        SCOPE_OWNERSHIP_FIELDS.has(name) ||
        name === 'OR' ||
        name === 'AND'
      ) {
        return true;
      }
    }
    return false;
  };
  if (ts.isObjectLiteralExpression(whereValue)) {
    return !hasCasAnchor(whereValue);
  }
  if (ts.isIdentifier(whereValue)) {
    const resolved = resolveObjectLiteral(sourceFile, whereValue);
    if (resolved) return !hasCasAnchor(resolved);
    // Opaque shared where (scopedWhere / ownershipWhere / CAS helper): cannot
    // prove a bare status write statically, treat as anchored.
    return false;
  }
  return false;
}

// Close-effects verdict (CLOSE-EFFECTS-INTEGRITY-001): an inspections
// update/updateMany in the close-effects file must key its where clause on the
// documents/selfCheckDocuments snapshot columns (the fields being merged) or
// an opaque scoped spread. Anything else — bare `{ id }`, a CAS on unrelated
// columns, or a single-column anchor — is flagged so the merge cannot silently
// regress to a lost update.
function analyzeCloseEffectWrite(sourceFile, options) {
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  const whereProp = getObjectProperty(options, 'where');
  if (!whereProp) return false;
  const whereValue = unwrapExpression(getPropertyInitializer(whereProp));
  const hasSnapshotAnchor = (whereObj) => {
    if (!ts.isObjectLiteralExpression(whereObj)) return false;
    if (getObjectProperty(whereObj, 'documents')) return true;
    if (getObjectProperty(whereObj, 'selfCheckDocuments')) return true;
    for (const property of whereObj.properties) {
      if (ts.isSpreadAssignment(property)) return true;
    }
    return false;
  };
  if (ts.isObjectLiteralExpression(whereValue)) {
    return !hasSnapshotAnchor(whereValue);
  }
  if (ts.isIdentifier(whereValue)) {
    const resolved = resolveObjectLiteral(sourceFile, whereValue);
    if (resolved) return !hasSnapshotAnchor(resolved);
    // Opaque shared where (scopedWhere / ownership helper): cannot prove an
    // unanchored merge statically, treat as anchored to avoid false positives.
    return false;
  }
  return false;
}

function analyzeFile(rootDir, filePath) {
  const sourceText = readFileSync(filePath, 'utf8');
  const repoPath = path.relative(rootDir, filePath).split(path.sep).join('/');
  if (TEST_FILE_PATTERN.test(repoPath)) return [];

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const findings = [];
  let sawIdempotencyHelper = false;
  const currentModule = getCurrentModule(repoPath);
  const reportedChineseNodes = new Set();
  const reportedSeedRoutes = new Set();

  function addFinding(rule, node, message, key) {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    findings.push({
      key,
      line: position.line + 1,
      message,
      path: repoPath,
      rule,
    });
  }

  function inspectChineseCondition(condition) {
    function visitCondition(node) {
      if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        CHINESE_TEXT_PATTERN.test(node.text) &&
        !reportedChineseNodes.has(node.pos)
      ) {
        reportedChineseNodes.add(node.pos);
        addFinding(
          'B-M2',
          node,
          'Do not branch on Chinese string literals; use a shared enum or constant.',
          `condition-${fingerprintText(node.text)}`,
        );
      }
      ts.forEachChild(node, visitCondition);
    }
    visitCondition(condition);
  }

  function visit(node) {
    const assertionType = getAssertionType(node);
    if (assertionType?.kind === ts.SyntaxKind.AnyKeyword) {
      addFinding(
        'B-T1',
        node,
        'Do not bypass type safety with an any assertion.',
        'any-assertion',
      );
    }
    if (
      assertionType &&
      getAssertionType(node.expression)?.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      addFinding(
        'B-T2',
        node,
        'Do not use double assertions through unknown.',
        'double-assertion',
      );
    }
    if (ts.isNonNullExpression(node)) {
      addFinding(
        'B-T3',
        node,
        'Do not use non-null assertions; add an explicit guard.',
        'non-null-assertion',
      );
    }
    if (isDateNowCall(node) && isIdGenerationTarget(node)) {
      addFinding(
        'B-S4',
        node,
        'Do not generate IDs with Date.now(); use cuid.',
        'date-now-id',
      );
    }

    const moduleSpecifier = getModuleSpecifier(node);
    if (
      moduleSpecifier &&
      currentModule &&
      isCrossModuleInternalImport(moduleSpecifier.text, currentModule)
    ) {
      addFinding(
        'B-M1',
        moduleSpecifier,
        'Cross-module imports must use the target module index.',
        `import-${moduleSpecifier.text}`,
      );
    }

    if (ts.isCatchClause(node)) {
      if (node.block.statements.length === 0) {
        addFinding(
          'B-E1',
          node,
          'Empty catch blocks are not allowed.',
          'empty-catch',
        );
      }
      if (!containsErrorLog(node.block)) {
        addFinding(
          'B-E2',
          node,
          'Catch blocks must record the error with an approved logger.',
          'catch-without-error-log',
        );
      }
    }

    // R-GET: GET routes are read-only contracts. Executing seed or other
    // write side effects from a GET handler violates the Do-Not-Merge list.
    if (
      /^apps\/backend\/api\/.*\.get\.ts$/u.test(repoPath) &&
      /seed/iu.test(sourceText) &&
      !reportedSeedRoutes.has(repoPath)
    ) {
      reportedSeedRoutes.add(repoPath);
      addFinding(
        'R-GET',
        sourceFile,
        'GET routes must not execute seed or other write side effects; move to an authorized POST route.',
        'seed-in-get-route',
      );
    }

    // R-SCOPE: protected resources must not be written by a bare business
    // identifier. Covers prisma./tx./client./options.tx. delegates, where
    // deformations (`{ id, isDeleted: false }`), business keys
    // (workOrderNumber / lossId / ...), batch `{ id: { in } }` writes and
    // helper-file escapes via PROTECTED_PRISMA_MODELS.
    if (ts.isCallExpression(node)) {
      const target = getScopedWriteTarget(node);
      if (target) {
        const moduleProtected = PROTECTED_SCOPE_MODULES.has(currentModule);
        const modelProtected = PROTECTED_PRISMA_MODELS.has(target.model);
        const moduleGuarded =
          moduleProtected && MODULE_GUARDED_MODELS.has(target.model);
        const borrowDomainWrite =
          METROLOGY_BORROW_FILE_PATTERN.test(repoPath) &&
          METROLOGY_BORROW_STATE_MODELS.has(target.model);
        const supervisionDomainWrite =
          SUPERVISION_FILE_PATTERN.test(repoPath) &&
          SUPERVISION_STATE_MODELS.has(target.model);
        const options = node.arguments[0];
        let writeIsBare = analyzeWriteWhere(sourceFile, options, target.model);
        if (borrowDomainWrite) {
          writeIsBare = analyzeBorrowStateWrite(sourceFile, options);
        } else if (supervisionDomainWrite) {
          writeIsBare = analyzeSupervisionStateWrite(
            sourceFile,
            options,
            target.model,
          );
        }
        if (
          (modelProtected ||
            moduleGuarded ||
            borrowDomainWrite ||
            supervisionDomainWrite) &&
          writeIsBare &&
          !hasAllowMarker(sourceFile, node, WRITE_ALLOW_MARKER_RE)
        ) {
          addFinding(
            'R-SCOPE',
            node,
            'Protected resource write keyed by a business identifier without a DataScope condition bypasses row-level authorization; use the scoped repository (updateAccessible/deleteAccessible) or an explicit scoped where.',
            `bare-id-write-${target.model}.${target.method}`,
          );
        }
      }
    }

    // R-SM: state-machine protected models must not write `status` without a
    // CAS anchor (expected current status) or a scope/ownership condition.
    // Covers prisma./tx./client. delegates; markers with a reason remain the
    // explicit system-maintenance escape hatch.
    if (ts.isCallExpression(node)) {
      const target = getScopedWriteTarget(node);
      if (
        target &&
        INSPECTION_CLOSE_EFFECT_FILE_PATTERN.test(repoPath) &&
        target.model === 'inspections' &&
        (target.method === 'update' || target.method === 'updateMany') &&
        analyzeCloseEffectWrite(sourceFile, node.arguments[0]) &&
        !hasAllowMarker(sourceFile, node, WRITE_ALLOW_MARKER_RE)
      ) {
        addFinding(
          'R-CLOSE-EFFECT',
          node,
          'Close-effects inspection documents write must anchor the where clause on the documents/selfCheckDocuments snapshot columns (optimistic CAS) or an opaque scoped spread; a bare-id or unrelated-CAS update can still lose concurrent attachment merges. Use mergeInspectionDocumentsWithCas or carry an explicit allow marker with a reason.',
          `close-effect-write-${target.model}.${target.method}`,
        );
      }
      if (
        target &&
        STATE_MACHINE_PROTECTED_MODELS.has(target.model) &&
        (target.method === 'update' || target.method === 'updateMany') &&
        analyzeStateMachineStatusWrite(sourceFile, node.arguments[0]) &&
        !hasAllowMarker(sourceFile, node, WRITE_ALLOW_MARKER_RE)
      ) {
        addFinding(
          'R-SM',
          node,
          'State-machine protected model status write without a CAS anchor (expected current status) or scope condition; concurrent transitions can overwrite each other. Key the where clause on the current status, use a scoped repository CAS write, or carry an explicit allow marker with a reason.',
          `state-write-${target.model}.${target.method}`,
        );
      }
    }

    // R-SCOPE-RAW: raw SQL in protected modules must carry the resolved
    // DataScope fragment through a named scoped helper, or an explicit
    // `// qms-arch-allow R-SCOPE-RAW: <reason>` marker. The analytics
    // modules (report/dashboard) are covered as well: KPI raw SQL must be
    // truly scoped, not marker-exempted.
    {
      const rawTag = getRawSqlTag(node);
      if (
        rawTag &&
        RAW_SQL_METHODS.has(rawTag.name.text) &&
        (PROTECTED_SCOPE_MODULES.has(currentModule) ||
          ANALYTICS_SCOPE_MODULES.has(currentModule)) &&
        !hasRawScopeHelperInFunction(sourceFile, node) &&
        !hasAllowMarker(sourceFile, node, RAW_ALLOW_MARKER_RE)
      ) {
        addFinding(
          'R-SCOPE-RAW',
          node,
          'Raw SQL in a protected/analytics module must embed a DataScope fragment (named scoped SQL helper) or carry an explicit allow marker with a reason.',
          `raw-sql-${rawTag.name.text.slice(1)}`,
        );
      }
    }

    // R-SCOPE-AGG: analytics modules must not aggregate protected business
    // rows without a DataScope anchor. A bare `findMany/count/aggregate/
    // groupBy` on inspections/quality_records/... in report/dashboard would
    // bypass row-level authorization the same way an unscoped update does.
    if (
      ts.isCallExpression(node) &&
      ANALYTICS_SCOPE_MODULES.has(currentModule)
    ) {
      const readTarget = getPrismaReadTarget(node);
      if (
        readTarget &&
        ANALYTICS_READ_MODELS.has(readTarget.model) &&
        !hasAnalyticsScopeAnchorInFunction(sourceFile, node) &&
        !hasAllowMarker(sourceFile, node, AGG_ALLOW_MARKER_RE)
      ) {
        addFinding(
          'R-SCOPE-AGG',
          node,
          'Analytics aggregate read on a protected model without a DataScope anchor bypasses row-level authorization; use buildScoped*Where / a named raw-scope helper / DataScopeService, or carry an explicit allow marker with a reason.',
          `unscoped-aggregate-read-${readTarget.model}.${readTarget.method}`,
        );
      }
    }

    // R-SCOPE-AGG (stats files): stats/statistics files inside a protected
    // scope module must not aggregate guard-listed models without a DataScope
    // anchor. This closes the inspection-request-stats bypass
    // (SEC-INSPECTION-REQUEST-ANALYTICS-001) while leaving ordinary
    // list/CRUD services untouched (they are covered by the write-oriented
    // R-SCOPE rules instead).
    if (
      ts.isCallExpression(node) &&
      STATS_AGGREGATE_READ_GUARD.has(currentModule) &&
      STATS_FILE_PATTERN.test(repoPath)
    ) {
      const readTarget = getPrismaReadTarget(node);
      if (
        readTarget &&
        STATS_AGGREGATE_READ_GUARD.get(currentModule).has(readTarget.model) &&
        !hasAnalyticsScopeAnchorInFunction(sourceFile, node) &&
        !hasAllowMarker(sourceFile, node, AGG_ALLOW_MARKER_RE)
      ) {
        addFinding(
          'R-SCOPE-AGG',
          node,
          'Stats aggregate read on a protected model without a DataScope anchor bypasses row-level authorization; use buildScoped*Where / a named raw-scope helper, or carry an explicit allow marker with a reason.',
          `unscoped-stats-aggregate-${readTarget.model}.${readTarget.method}`,
        );
      }
    }

    // R-BOUNDED-READ: the confirmed high-risk list/export entries must
    // paginate (skip + take) or bound rows (take = EXPORT_QUERY_TAKE) in the
    // database. The invariant is file + function scoped, so an unscoped
    // findMany elsewhere cannot trip it and the rule never generalizes to a
    // global "findMany must have take" ban.
    if (ts.isCallExpression(node)) {
      const readTarget = getPrismaReadTarget(node);
      if (readTarget) {
        for (const invariant of BOUNDED_READ_INVARIANTS) {
          if (!invariant.filePattern.test(repoPath)) continue;
          if (
            readTarget.model !== invariant.model ||
            readTarget.method !== invariant.method
          ) {
            continue;
          }
          const fn = getEnclosingFunction(node);
          if (!fn || getFunctionName(fn) !== invariant.functionName) {
            continue;
          }
          if (!hasBoundedReadShape(sourceFile, node, invariant)) {
            addFinding(
              'R-BOUNDED-READ',
              node,
              invariant.message,
              invariant.key,
            );
          }
        }
        for (const invariant of DB_AGGREGATION_INVARIANTS) {
          if (!invariant.filePattern.test(repoPath)) continue;
          if (
            readTarget.model !== invariant.model ||
            readTarget.method !== invariant.method
          ) {
            continue;
          }
          if (
            !invariant.functionNames.has(getNamedEnclosingFunctionName(node))
          ) {
            continue;
          }
          addFinding(
            'R-DB-AGGREGATION',
            node,
            invariant.message,
            invariant.key,
          );
        }
      }
    }

    // PERF-QMS-001 / PHASE-1B: the dashboard monthly trend must stay a single
    // year-range database aggregation; reverting to 12 sequential
    // getNetPassRateSummaryByRange calls reintroduces the query fanout.
    if (
      repoPath === 'apps/backend/modules/dashboard/dashboard.service.ts' &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'getNetPassRateSummaryByRange' &&
      getNamedEnclosingFunctionName(node) === 'getMonthlyTrend'
    ) {
      addFinding(
        'R-DB-AGGREGATION',
        node,
        'The dashboard monthly trend must use getPassRateMonthlyTrend (one year-range aggregation); per-month getNetPassRateSummaryByRange calls regress PERF-QMS-001/PHASE-1B.',
        'dashboard-monthly-trend-query-fanout',
      );
    }

    // B-EC: BusinessError codes must come from the shared ErrorCode dictionary.
    // Ad-hoc string codes invent new vocabulary that the frontend cannot grade.
    if (ts.isNewExpression(node) && node.expression) {
      const callee = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : node.expression.getText(sourceFile);
      if (callee === 'BusinessError' && node.arguments?.length) {
        const firstArg = node.arguments[0];
        if (
          firstArg &&
          (ts.isStringLiteral(firstArg) ||
            ts.isNoSubstitutionTemplateLiteral(firstArg)) &&
          !DECLARED_ERROR_CODES.has(firstArg.text)
        ) {
          addFinding(
            'B-EC',
            firstArg,
            'BusinessError code must be a member of the shared ErrorCode dictionary (add new codes to @qgs/shared ErrorCode first).',
            `error-code-${firstArg.text}`,
          );
        }
      }
    }

    // R-IDEMPOTENCY: protected create entries must go through
    // withRequestIdempotency; otherwise a retried request creates a second
    // business entity (serial uniqueness only prevents id collisions).
    if (getProtectedCreateOperation(repoPath) && ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (ts.isIdentifier(callee) && callee.text === 'withRequestIdempotency') {
        sawIdempotencyHelper = true;
      }
    }

    if (ts.isIfStatement(node)) inspectChineseCondition(node.expression);
    if (ts.isConditionalExpression(node))
      inspectChineseCondition(node.condition);
    if (ts.isSwitchStatement(node)) inspectChineseCondition(node.expression);
    if (ts.isCaseClause(node)) inspectChineseCondition(node.expression);
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      inspectChineseCondition(node.expression);
    }
    if (ts.isForStatement(node) && node.condition) {
      inspectChineseCondition(node.condition);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  const protectedCreateOperation = getProtectedCreateOperation(repoPath);
  if (protectedCreateOperation && !sawIdempotencyHelper) {
    findings.push({
      key: 'missing-withRequestIdempotency',
      line: 1,
      message: `The ${protectedCreateOperation.operationKey} create entry must wrap its write in withRequestIdempotency (IDEMPOTENCY-KEY-001); a retried request can otherwise create a duplicate business entity.`,
      path: repoPath,
      rule: 'R-IDEMPOTENCY',
    });
  }
  if (
    protectedCreateOperation &&
    sawIdempotencyHelper &&
    !sourceText.includes(protectedCreateOperation.operationKey)
  ) {
    findings.push({
      key: 'idempotency-operation-key-drift',
      line: 1,
      message: `The ${protectedCreateOperation.operationKey} create entry must reference its registered operationKey literal; copy-pasted entries risk sharing another operation identity.`,
      path: repoPath,
      rule: 'R-IDEMPOTENCY',
    });
  }
  return findings;
}

function analyzeIdentityFile(rootDir, filePath, governedIdentityTargets) {
  const rawSourceText = readFileSync(filePath, 'utf8');
  const repoPath = path.relative(rootDir, filePath).split(path.sep).join('/');
  if (TEST_FILE_PATTERN.test(repoPath)) return [];

  const sourceText = getIdentitySourceText(filePath, rawSourceText);
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );
  const findings = [];
  const governedNameFields = getGovernedNameFields(governedIdentityTargets);

  function addFinding(rule, node, message, key) {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    findings.push({
      key,
      line: position.line + 1,
      message,
      path: repoPath,
      rule,
    });
  }

  function inspectChangedEvent(node) {
    if (!isEventEmitCall(node) || node.arguments.length < 2) return;
    const eventName = unwrapExpression(node.arguments[0]);
    if (
      !ts.isStringLiteral(eventName) ||
      !INSPECTION_CHANGED_EVENTS.has(eventName.text)
    ) {
      return;
    }
    const payload = resolveObjectLiteral(sourceFile, node.arguments[1]);
    if (!payload) return;

    for (const [nameProperty, idProperty] of [
      ['supplierBrands', 'supplierIds'],
      ['supplierNames', 'supplierIds'],
      ['teamNames', 'teamIds'],
      ['teams', 'teamIds'],
    ]) {
      const names = getObjectProperty(payload, nameProperty);
      if (
        !names ||
        isDefinitelyEmptyArray(getPropertyInitializer(names)) ||
        getObjectProperty(payload, idProperty)
      ) {
        continue;
      }
      addFinding(
        'B-ID2',
        names,
        `${eventName.text} payloads with ${nameProperty} must also include ${idProperty}.`,
        `${eventName.text}-${nameProperty}-without-${idProperty}`,
      );
    }
  }

  function inspectControlledSupplierWrite(node) {
    const target = getPrismaWriteTarget(node);
    if (
      !target ||
      NAME_ONLY_SUPPLIER_WRITE_ALLOWLIST.has(repoPath) ||
      node.arguments.length === 0
    ) {
      return;
    }
    const options = resolveObjectLiteral(sourceFile, node.arguments[0]);
    if (!options) return;
    const dataProperties =
      target.method === 'upsert' ? ['create', 'update'] : ['data'];

    for (const dataPropertyName of dataProperties) {
      const dataProperty = getObjectProperty(options, dataPropertyName);
      const dataInitializer = getPropertyInitializer(dataProperty);
      if (!dataInitializer) continue;
      for (const data of resolveObjectLiterals(sourceFile, dataInitializer)) {
        const supplierName = getObjectProperty(data, 'supplierName');
        if (!supplierName || getObjectProperty(data, 'supplierId')) continue;
        addFinding(
          'B-ID3',
          supplierName,
          `${target.model}.${target.method} must write supplierId whenever it writes supplierName.`,
          `${target.model}-${target.method}-${dataPropertyName}-supplier-name-only`,
        );
      }
    }
  }

  function inspectNameBasedScoringIdentity(node) {
    if (
      repoPath ===
        'apps/web-antd/src/views/qms/supplier/components/SupplierDetailDrawer.vue' &&
      ts.isCallExpression(node)
    ) {
      const expression = unwrapExpression(node.expression);
      const firstArgument = node.arguments[0]
        ? resolveObjectLiteral(sourceFile, node.arguments[0])
        : undefined;
      if (
        ts.isIdentifier(expression) &&
        expression.text === 'getAfterSalesList' &&
        firstArgument &&
        getObjectProperty(firstArgument, 'supplierBrand') &&
        !getObjectProperty(firstArgument, 'supplierBrandId')
      ) {
        addFinding(
          'B-ID4',
          node,
          'Supplier portrait after-sales queries must use supplierBrandId.',
          'supplier-portrait-after-sales-name-query',
        );
      }
    }
    if (!ID_FIRST_SCORING_FILES.has(repoPath)) return;
    if (ts.isPropertyAssignment(node)) {
      const propertyName = getPropertyNameText(node.name);
      const initializer = unwrapExpression(node.initializer);
      if (
        NAME_IDENTITY_QUERY_PROPERTIES.has(propertyName) &&
        ts.isObjectLiteralExpression(initializer) &&
        getObjectProperty(initializer, 'in')
      ) {
        addFinding(
          'B-ID4',
          node,
          `Supplier scoring queries must use canonical IDs instead of ${propertyName}.`,
          `name-based-scoring-query-${propertyName}`,
        );
      }
    }
    if (!ts.isCallExpression(node)) return;
    const expression = unwrapExpression(node.expression);
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'supplierByName' &&
      expression.name.text === 'get'
    ) {
      addFinding(
        'B-ID4',
        node,
        'Supplier score snapshots must not resolve supplier identity by name.',
        'supplier-score-name-map',
      );
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      expression.name.text === 'resolveCanonicalIdsByNames'
    ) {
      addFinding(
        'B-ID4',
        node,
        'Supplier score snapshots must use explicit identity links instead of name-derived TEAM IDs.',
        'supplier-score-name-derived-team-id',
      );
    }
  }

  function inspectInspectionStatsIdentityRead(node) {
    if (repoPath !== INSPECTION_REQUEST_STATS_FILE) return;
    const fieldName = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : getElementAccessName(node);
    if (!INSPECTION_STATS_NAME_FIELDS.has(fieldName)) return;
    addFinding(
      'B-ID6',
      node,
      `Inspection request statistics must aggregate by canonical IDs instead of ${fieldName} snapshots.`,
      `inspection-stats-name-read-${fieldName}`,
    );
  }

  function inspectDictionaryMutationGuard(node) {
    if (
      repoPath !== DICTIONARY_SERVICE_FILE ||
      !ts.isVariableDeclaration(node) ||
      !ts.isIdentifier(node.name) ||
      node.name.text !== 'DictionaryService' ||
      !node.initializer ||
      !ts.isObjectLiteralExpression(node.initializer)
    ) {
      return;
    }
    for (const member of node.initializer.properties) {
      if (!ts.isMethodDeclaration(member)) continue;
      const methodName = getPropertyNameText(member.name);
      if (
        !GUARDED_DICTIONARY_MUTATIONS.has(methodName) ||
        !member.body ||
        containsNamedCall(member.body, TEAM_MUTATION_GUARD)
      ) {
        continue;
      }
      addFinding(
        'B-ID7',
        member,
        `DictionaryService.${methodName} must call ${TEAM_MUTATION_GUARD} before writing.`,
        `dictionary-${methodName}-without-team-guard`,
      );
    }
  }

  function inspectGovernedNameGroupBy(node) {
    const model = getPrismaCallModel(node, 'groupBy');
    const modelTargets = governedIdentityTargets.get(model);
    if (!modelTargets || node.arguments.length === 0) return;
    const options = resolveObjectLiteral(sourceFile, node.arguments[0]);
    if (!options) return;
    const byInitializer = getPropertyInitializer(
      getObjectProperty(options, 'by'),
    );
    if (!byInitializer) return;
    const byFields = unwrapExpression(byInitializer);
    if (!ts.isArrayLiteralExpression(byFields)) return;

    for (const element of byFields.elements) {
      const field = unwrapExpression(element);
      if (!ts.isStringLiteral(field)) continue;
      const idField = modelTargets.get(field.text);
      if (!idField) continue;
      addFinding(
        'B-ID8',
        field,
        `${model}.${field.text} is a display snapshot; group by ${idField} and hydrate the name after aggregation.`,
        `${model}-group-by-${field.text}`,
      );
    }
  }

  function isMapExpression(expression, seenNames = new Set()) {
    const unwrapped = unwrapExpression(expression);
    if (
      ts.isNewExpression(unwrapped) &&
      ts.isIdentifier(unwrapped.expression) &&
      unwrapped.expression.text === 'Map'
    ) {
      return true;
    }
    if (!ts.isIdentifier(unwrapped) || seenNames.has(unwrapped.text)) {
      return false;
    }
    const initializer = findVariableInitializer(sourceFile, unwrapped.text);
    return initializer
      ? isMapExpression(initializer, new Set(seenNames).add(unwrapped.text))
      : false;
  }

  function expressionReadsGovernedName(expression, seenNames = new Set()) {
    const unwrapped = unwrapExpression(expression);
    const fieldName = ts.isPropertyAccessExpression(unwrapped)
      ? unwrapped.name.text
      : getElementAccessName(unwrapped);
    if (governedNameFields.has(fieldName)) return fieldName;
    if (
      ts.isPropertyAccessExpression(unwrapped) ||
      ts.isElementAccessExpression(unwrapped)
    ) {
      return '';
    }

    if (ts.isIdentifier(unwrapped) && !seenNames.has(unwrapped.text)) {
      const initializer = findVariableInitializer(sourceFile, unwrapped.text);
      if (initializer) {
        const field = expressionReadsGovernedName(
          initializer,
          new Set(seenNames).add(unwrapped.text),
        );
        if (field) return field;
      }
    }

    let matchedField = '';
    ts.forEachChild(unwrapped, (child) => {
      if (matchedField) return;
      matchedField = expressionReadsGovernedName(child, seenNames);
    });
    return matchedField;
  }

  function inspectGovernedNameMapKey(node) {
    if (
      !repoPath.startsWith('apps/backend/modules/') ||
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      !MAP_KEY_METHODS.has(node.expression.name.text) ||
      node.arguments.length === 0 ||
      !isMapExpression(node.expression.expression)
    ) {
      return;
    }
    const fieldName = expressionReadsGovernedName(node.arguments[0]);
    if (!fieldName) return;
    addFinding(
      'B-ID9',
      node.arguments[0],
      `${fieldName} is a display snapshot; Map identity keys must use the registered canonical ID field.`,
      `map-key-from-governed-name-${fieldName}`,
    );
  }

  function visit(node) {
    if (
      ts.isStringLiteral(node) &&
      node.text === 'legacy-import' &&
      !LEGACY_IDENTITY_IMPORT_ALLOWLIST.has(repoPath)
    ) {
      addFinding(
        'B-ID5',
        node,
        'Legacy name-to-ID resolution is restricted to reviewed import adapters.',
        'unapproved-legacy-identity-import',
      );
    }
    if (ts.isPropertyAssignment(node)) {
      const initializer = unwrapExpression(node.initializer);
      if (
        getPropertyNameText(node.name) === 'valueKey' &&
        ts.isStringLiteral(initializer) &&
        initializer.text === 'name'
      ) {
        addFinding(
          'B-ID1',
          node,
          "Do not configure selectors with valueKey: 'name'; use the canonical ID.",
          'name-value-key',
        );
      }
    }
    inspectChangedEvent(node);
    inspectControlledSupplierWrite(node);
    inspectNameBasedScoringIdentity(node);
    inspectInspectionStatsIdentityRead(node);
    inspectDictionaryMutationGuard(node);
    inspectGovernedNameGroupBy(node);
    inspectGovernedNameMapKey(node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function groupFindings(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const fingerprint = `${finding.rule}|${finding.path}|${finding.key}`;
    const group = groups.get(fingerprint) ?? [];
    group.push(finding);
    groups.set(fingerprint, group);
  }
  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function printRecord(fields) {
  process.stdout.write(
    `${fields.map((field) => String(field).replaceAll('\t', ' ')).join('\t')}\n`,
  );
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const rootDir = path.resolve(options.root);
  const baseline = loadBaseline(options.baseline);
  const governedIdentityTargets = loadGovernedIdentityTargets(rootDir);
  const files = readFileSync(options.filesFrom, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((filePath) => path.resolve(filePath));
  const identityFiles = options.identityFilesFrom
    ? readFileSync(options.identityFilesFrom, 'utf8')
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((filePath) => path.resolve(filePath))
    : [];
  const findings = [
    ...files.flatMap((filePath) => analyzeFile(rootDir, filePath)),
    ...identityFiles.flatMap((filePath) =>
      analyzeIdentityFile(rootDir, filePath, governedIdentityTargets),
    ),
  ];

  for (const [fingerprint, group] of groupFindings(findings)) {
    const first = group[0];
    if (!first) continue;
    if (options.printBaseline) {
      process.stdout.write(`${fingerprint}|${group.length}\n`);
      continue;
    }

    const allowed = baseline.get(fingerprint) ?? 0;
    const suppressed = Math.min(allowed, group.length);
    if (suppressed > 0) {
      printRecord([
        'BASELINE',
        first.rule,
        `${first.path}:${first.key}`,
        `${suppressed}/${allowed} existing violations`,
      ]);
    }
    for (const finding of group.slice(allowed)) {
      printRecord([
        'VIOLATION',
        finding.rule,
        `${finding.path}:${finding.line}`,
        finding.message,
      ]);
    }
  }
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
