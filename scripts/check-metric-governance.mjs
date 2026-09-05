#!/usr/bin/env node

/**
 * METRIC-GOVERNANCE-001 invariant guard.
 *
 * This guard intentionally examines only the metric-governance schema models
 * and module AST. It is not a repository-wide text scan: each check protects
 * an explicit lifecycle invariant that cannot be delegated to a generic
 * aggregation registry.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const ROOT_DIR = process.cwd();
const MODULE_DIR = 'apps/backend/modules/metric-governance';
const SCHEMA_FILE = 'apps/backend/prisma/schema.prisma';
const DEFINITION_MODEL = 'metric_definitions';
const VERSION_MODEL = 'metric_definition_versions';
const APPROVAL_EVIDENCE_MODEL = 'metric_approval_evidences';
const CANONICAL_MAPPING_MODEL = 'metric_canonical_mappings';
const OWNER_ASSIGNMENT_MODEL = 'metric_owner_assignments';
const DEPRECATED_METRIC_CODES = [
  'BM-PASS-RATE',
  'BM-QUALITY-LOSS-TREND',
  'BM-WORK-ORDER-INSPECTION-COMPLETION',
  'BM-VEHICLE-FAILURE-INTENSITY',
  'BM-DFMEA-RPN-RISK',
];
const FORBIDDEN_EXECUTION_FIELDS = new Set([
  'expression',
  'formula',
  'javascript',
  'script',
  'sql',
]);
const VERSION_MUTATION_METHODS = new Set([
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
]);
const DELETE_METHODS = new Set(['delete', 'deleteMany']);

function parseRoot(argv) {
  const rootIndex = argv.indexOf('--root');
  if (rootIndex === -1) return ROOT_DIR;
  const value = argv[rootIndex + 1];
  if (!value) throw new Error('Missing --root value');
  return path.resolve(value);
}

function getModelFields(schema, modelName) {
  const startMarker = `model ${modelName} {`;
  const start = schema.indexOf(startMarker);
  if (start === -1) return new Set();
  const end = schema.indexOf('\n}', start);
  if (end === -1) return new Set();
  return new Set(
    schema
      .slice(start + startMarker.length, end)
      .split(/\r?\n/u)
      .map((line) => line.trim().split(/\s+/u)[0])
      .filter((field) => field && !field.startsWith('@@')),
  );
}

function getModelFieldLine(schema, modelName, fieldName) {
  const startMarker = `model ${modelName} {`;
  const start = schema.indexOf(startMarker);
  const end = schema.indexOf('\n}', start);
  if (start === -1 || end === -1) return '';
  return schema
    .slice(start, end)
    .split(/\r?\n/u)
    .find((line) => line.trim().startsWith(`${fieldName} `))
    ?.trim();
}

function collectTypeScriptFiles(rootDir) {
  const absoluteDir = path.join(rootDir, MODULE_DIR);
  const files = [];
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts'))
      continue;
    files.push(path.join(absoluteDir, entry.name));
  }
  return files;
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (/\.(?:ts|vue)$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function getPropertyChain(node) {
  const names = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) names.unshift(current.text);
  return names;
}

function objectLiteralProperty(node, name) {
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  return node.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name)),
  );
}

function hasLifecycleCas(call) {
  const [argument] = call.arguments;
  const where = objectLiteralProperty(argument, 'where');
  if (!where || !ts.isPropertyAssignment(where)) return false;
  return Boolean(
    objectLiteralProperty(where.initializer, 'status') &&
      objectLiteralProperty(where.initializer, 'revision'),
  );
}

function report(violations, rule, file, message) {
  violations.push(`[${rule}] ${file}  ${message}`);
}

function checkSchema(rootDir, violations) {
  const schemaPath = path.join(rootDir, SCHEMA_FILE);
  const schema = readFileSync(schemaPath, 'utf8');
  const definitionFields = getModelFields(schema, DEFINITION_MODEL);
  const versionFields = getModelFields(schema, VERSION_MODEL);
  const approvalEvidenceFields = getModelFields(
    schema,
    APPROVAL_EVIDENCE_MODEL,
  );
  const mappingFields = getModelFields(schema, CANONICAL_MAPPING_MODEL);
  const ownerAssignmentFields = getModelFields(schema, OWNER_ASSIGNMENT_MODEL);

  for (const field of [
    'metricCode',
    'metricName',
    'domain',
    'category',
    'ownerDeptId',
    'ownerStatus',
    'status',
    'currentVersion',
    'revision',
    'ownerAssignments',
  ]) {
    if (!definitionFields.has(field)) {
      report(
        violations,
        'MG-SCHEMA',
        SCHEMA_FILE,
        `${DEFINITION_MODEL}.${field} is required.`,
      );
    }
  }
  const metricCodeLine = getModelFieldLine(
    schema,
    DEFINITION_MODEL,
    'metricCode',
  );
  if (!metricCodeLine?.includes('@unique')) {
    report(
      violations,
      'MG-UNIQUE-CODE',
      SCHEMA_FILE,
      'metricCode must be globally unique.',
    );
  }
  for (const field of [
    'metricDefinitionId',
    'version',
    'businessDefinition',
    'formulaType',
    'sourceModel',
    'sourceFields',
    'dimensions',
    'exclusions',
    'scopePolicy',
    'refreshPolicy',
    'unit',
    'precision',
    'effectiveFromAt',
    'conflictStatus',
    'approvalEvidences',
    'approvalEvidence',
    'decisionHistoryId',
    'sourceDocument',
  ]) {
    if (!versionFields.has(field)) {
      report(
        violations,
        'MG-SCHEMA',
        SCHEMA_FILE,
        `${VERSION_MODEL}.${field} is required.`,
      );
    }
  }
  if (!schema.includes('@@unique([metricDefinitionId, version]')) {
    report(
      violations,
      'MG-UNIQUE-VERSION',
      SCHEMA_FILE,
      'definition versions must be unique per metric and version.',
    );
  }
  for (const field of [
    'metricDefinitionVersionId',
    'decisionHistoryId',
    'decisionStatus',
    'approvedOption',
    'approvedDefinition',
    'decisionSource',
    'decisionBy',
    'sourceDocument',
  ]) {
    if (!approvalEvidenceFields.has(field)) {
      report(
        violations,
        'MG-APPROVAL-EVIDENCE',
        SCHEMA_FILE,
        `${APPROVAL_EVIDENCE_MODEL}.${field} is required.`,
      );
    }
  }
  if (
    !schema.includes('@@unique([metricDefinitionVersionId, decisionHistoryId]')
  ) {
    report(
      violations,
      'MG-APPROVAL-EVIDENCE',
      SCHEMA_FILE,
      'approval evidence must be unique per metric version and decision.',
    );
  }
  for (const field of [
    'legacyMetricDefinitionId',
    'canonicalMetricDefinitionVersionId',
    'decisionHistoryId',
    'mappingType',
    'sourceDocument',
  ]) {
    if (!mappingFields.has(field)) {
      report(
        violations,
        'MG-CANONICAL-VERSION',
        SCHEMA_FILE,
        `${CANONICAL_MAPPING_MODEL}.${field} is required.`,
      );
    }
  }
  for (const field of [
    'metricDefinitionId',
    'ownerRole',
    'ownerLabel',
    'ownerStatus',
  ]) {
    if (!ownerAssignmentFields.has(field)) {
      report(
        violations,
        'MG-OWNER-ASSIGNMENT',
        SCHEMA_FILE,
        `${OWNER_ASSIGNMENT_MODEL}.${field} is required.`,
      );
    }
  }
  for (const field of [...definitionFields, ...versionFields]) {
    if (FORBIDDEN_EXECUTION_FIELDS.has(field)) {
      report(
        violations,
        'MG-NO-EXECUTION-FIELD',
        SCHEMA_FILE,
        `forbidden executable field '${field}'.`,
      );
    }
  }
}

function checkModuleAst(rootDir, violations) {
  for (const filePath of collectTypeScriptFiles(rootDir)) {
    const source = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const relativeFile = path.relative(rootDir, filePath);
    const isLifecycleService = filePath.endsWith(
      'metric-governance.service.ts',
    );
    let usesActivationReadinessValidator = false;

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const chain = getPropertyChain(node.expression);
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'assertActivationReadiness'
        ) {
          usesActivationReadinessValidator = true;
        }
        const [delegate, method] = chain.slice(-2);
        if (
          delegate === VERSION_MODEL &&
          VERSION_MUTATION_METHODS.has(method)
        ) {
          report(
            violations,
            'MG-APPEND-ONLY-VERSION',
            relativeFile,
            `${VERSION_MODEL}.${method} violates append-only version history.`,
          );
        }
        if (delegate === DEFINITION_MODEL && DELETE_METHODS.has(method)) {
          report(
            violations,
            'MG-NO-PHYSICAL-DELETE',
            relativeFile,
            `${DEFINITION_MODEL}.${method} is forbidden; use DEPRECATED lifecycle state.`,
          );
        }
        if (delegate === VERSION_MODEL && DELETE_METHODS.has(method)) {
          report(
            violations,
            'MG-NO-PHYSICAL-DELETE',
            relativeFile,
            `${VERSION_MODEL}.${method} is forbidden; retain history.`,
          );
        }
        if (delegate === DEFINITION_MODEL && method === 'update') {
          report(
            violations,
            'MG-NO-DIRECT-UPDATE',
            relativeFile,
            'use updateMany with status and revision CAS; direct update can overwrite ACTIVE definitions.',
          );
        }
        if (
          delegate === DEFINITION_MODEL &&
          method === 'updateMany' &&
          !hasLifecycleCas(node)
        ) {
          report(
            violations,
            'MG-LIFECYCLE-CAS',
            relativeFile,
            'definition mutation must constrain both lifecycle status and revision in where.',
          );
        }
        if (
          chain.at(-1) === 'eval' ||
          chain.at(-1) === 'queryRaw' ||
          chain.at(-1) === 'executeRaw' ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'Function')
        ) {
          report(
            violations,
            'MG-NO-EXECUTION',
            relativeFile,
            'metric governance must not execute a formula or query payload.',
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    if (
      isLifecycleService &&
      (source.includes('async activate(') ||
        source.includes('async function activate(')) &&
      !usesActivationReadinessValidator
    ) {
      report(
        violations,
        'MG-ACTIVATION-READINESS',
        relativeFile,
        'activation must use the readiness validator before setting ACTIVE.',
      );
    }
  }
}

function collectDeprecatedConsumerWarnings(rootDir) {
  const warnings = [];
  for (const relativeDirectory of [
    'apps/backend/modules',
    'apps/web-antd/src',
  ]) {
    const directory = path.join(rootDir, relativeDirectory);
    for (const filePath of collectSourceFiles(directory)) {
      const relativeFile = path.relative(rootDir, filePath);
      if (relativeFile.includes('/modules/metric-governance/')) continue;
      const source = readFileSync(filePath, 'utf8');
      for (const metricCode of DEPRECATED_METRIC_CODES) {
        if (source.includes(metricCode)) {
          warnings.push(
            `[MG-DEPRECATED-CONSUMER-WARNING] ${relativeFile}  potential direct consumer of ${metricCode}; replace it before deprecation.`,
          );
        }
      }
    }
  }
  return warnings;
}

function main() {
  const rootDir = parseRoot(process.argv.slice(2));
  const violations = [];
  checkSchema(rootDir, violations);
  checkModuleAst(rootDir, violations);
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  const warnings = collectDeprecatedConsumerWarnings(rootDir);
  if (warnings.length > 0) process.stdout.write(`${warnings.join('\n')}\n`);
  process.stdout.write('Metric governance invariant check passed.\n');
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}
