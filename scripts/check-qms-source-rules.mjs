#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const CHINESE_TEXT_PATTERN = /[\u3400-\u9FFF]/u;
const TEST_FILE_PATTERN =
  /(?:^|\/)(?:__tests__|test|tests)\/|\.(?:spec|test)\.[cm]?[jt]sx?$/u;
const ID_NAME_PATTERN = /^(?:id|.*(?:Id|ID|_id))$/u;
const ERROR_LOG_FUNCTIONS = new Set(['logApiError', 'logDatabaseError']);
const INSPECTION_CHANGED_EVENTS = new Set([
  'after_sales.changed',
  'inspection_issue.changed',
  'inspection_record.changed',
]);
const CONTROLLED_SUPPLIER_MODELS = new Set(['inspections', 'quality_records']);
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
// Legacy import adapters must be individually reviewed before their exact path
// is added here. Online business services are never exempt.
const NAME_ONLY_SUPPLIER_WRITE_ALLOWLIST = new Set([]);
const LEGACY_IDENTITY_IMPORT_ALLOWLIST = new Set([
  'apps/backend/modules/after-sales/after-sales-route.service.ts',
  'apps/backend/modules/inspection/inspection-issue.ts',
  'apps/backend/modules/inspection/inspection-record-import.post.service.ts',
  'apps/backend/utils/governed-write.ts',
]);

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
  const currentModule = getCurrentModule(repoPath);
  const reportedChineseNodes = new Set();

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
  return findings;
}

function analyzeIdentityFile(rootDir, filePath) {
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
      analyzeIdentityFile(rootDir, filePath),
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
