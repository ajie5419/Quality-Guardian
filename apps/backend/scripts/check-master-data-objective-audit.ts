import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  listMasterDataGovernanceFields,
  listMasterDataGovernanceWaves,
} from '../utils/master-data-governance-registry';

type AuditStatus = 'fail' | 'pass' | 'warn';

interface AuditItem {
  detail: string;
  evidence: Record<string, unknown>;
  key: string;
  requirement: string;
  status: AuditStatus;
}

interface BacklogReport {
  statusBreakdown: {
    deferred: number;
    excluded: number;
    planned: number;
  };
  summary: {
    actionablePendingFields?: number;
    decisionCoverage: number;
    excludedBreakdown?: {
      business_excluded?: number;
      canonical_source?: number;
      covered_by_governance?: number;
      other?: number;
      system_metadata?: number;
    };
    governedFields: number;
    pendingFields: number;
    semanticFields: number;
    undecidedFields: number;
  };
}

interface BacklogDecisionConfig {
  decisions?: Array<{
    key?: string;
    status?: string;
  }>;
}

interface ConsistencyReport {
  summary: {
    allAligned: boolean;
    totalInvalidCanonicalId: number;
    totalMissingCanonicalId: number;
    totalOrphanValues: number;
  };
}

interface GovernanceReport {
  fields?: Array<{
    rolloutWave?: number;
  }>;
  configKeys: string[];
  reportLabel?: string;
}

interface CoverageReport {
  totals: {
    totalMissingHits: number;
  };
}

interface ObjectiveAuditSummary {
  fail: number;
  pass: number;
  warn: number;
}

interface GovernanceQuantifiedResult {
  canonical_fields: number;
  excluded_business_excluded: null | number;
  excluded_canonical_source: null | number;
  excluded_covered_by_governance: null | number;
  excluded_other: null | number;
  excluded_system_metadata: null | number;
  excluded_total: null | number;
  gate_fail_count: number;
  gate_pass_count: number;
  name_only_fields: number;
  orphan_values: null | number;
  total_fields: number;
}

const REQUIRED_SUPERVISION_EXCLUDED_KEYS = [
  'supervision_issues.issueType',
  'supervision_issue_actions.actionType',
  'supervision_projects.projectType',
  'supervision_projects.participants',
  'supervision_plan_tasks.taskName',
  'supervision_plan_tasks.resourceName',
  'supervision_plan_tasks.riskReason',
] as const;

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

function resolveRepoRoot() {
  const cwd = process.cwd();
  const backendSuffix = `${path.sep}apps${path.sep}backend`;
  if (cwd.endsWith(backendSuffix)) {
    return path.resolve(cwd, '..', '..');
  }
  return cwd;
}

async function readJson<T>(filePath: string) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

async function pickLatestJsonFile(dirPath: string, pattern?: RegExp) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
  const files = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .filter((name) => (pattern ? pattern.test(name) : true))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return path.resolve(dirPath, files[0]);
}

async function pickLatestWaveEvidenceReport(
  dirPath: string,
  wave: number,
  waveFieldKeys: string[],
) {
  const primary = await pickLatestJsonFile(
    dirPath,
    new RegExp(`governance-report-.*release-wave${wave}\\.json$`),
  );
  if (primary) return primary;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }

  const candidates = entries
    .filter((item) => item.isFile() && item.name.endsWith('.json'))
    .map((item) => item.name)
    .filter((name) => name.startsWith('governance-report-'))
    .sort()
    .reverse();

  for (const name of candidates) {
    const fullPath = path.resolve(dirPath, name);
    let report: GovernanceReport;
    try {
      report = await readJson<GovernanceReport>(fullPath);
    } catch {
      continue;
    }

    const fields = Array.isArray(report.fields) ? report.fields : [];
    const byWave = fields.some((item) => Number(item.rolloutWave) === wave);
    if (byWave) return fullPath;

    const configKeys = Array.isArray(report.configKeys)
      ? report.configKeys
      : [];
    const requiredKeys = waveFieldKeys.filter(Boolean);
    if (requiredKeys.length === 0) continue;
    const coveredByKeys = requiredKeys.every((key) => configKeys.includes(key));
    if (coveredByKeys) return fullPath;
  }

  return null;
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function pushItem(
  items: AuditItem[],
  payload: {
    detail: string;
    evidence?: Record<string, unknown>;
    key: string;
    requirement: string;
    status: AuditStatus;
  },
) {
  items.push({
    key: payload.key,
    requirement: payload.requirement,
    status: payload.status,
    detail: payload.detail,
    evidence: payload.evidence || {},
  });
}

function toFiniteNonNegativeInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const failOnWarn = parseBool(args.get('failOnWarn'), false);
  const repoRoot = resolveRepoRoot();
  const backendDir = path.resolve(repoRoot, 'apps', 'backend');
  const tmpDir = path.resolve(repoRoot, 'tmp', 'master-data-governance');
  const backlogDir = path.resolve(tmpDir, 'backlog');
  const consistencyDir = path.resolve(tmpDir, 'consistency');
  const reportsDir = path.resolve(tmpDir, 'reports');
  const writeCoverageDir = path.resolve(tmpDir, 'write-coverage');
  const readCoverageDir = path.resolve(tmpDir, 'read-coverage');
  const canonicalBaselinePath = path.resolve(tmpDir, 'baseline.json');
  const baselineSnapshotPath = await pickLatestJsonFile(
    tmpDir,
    /baseline-.*\.json$/,
  );
  const baselinePath = baselineSnapshotPath || canonicalBaselinePath;
  const releaseGatePath = path.resolve(
    repoRoot,
    'scripts',
    'check-master-data-release-gate.mjs',
  );
  const acceptanceScriptPath = path.resolve(
    backendDir,
    'scripts',
    'check-master-data-acceptance.ts',
  );
  const templateGeneratorPath = path.resolve(
    backendDir,
    'scripts',
    'generate-master-data-governance-template.ts',
  );
  const templateVerifierPath = path.resolve(
    backendDir,
    'scripts',
    'verify-master-data-governance-template.ts',
  );
  const registryPath = path.resolve(
    backendDir,
    'utils',
    'master-data-governance-registry.ts',
  );
  const writeHelperPath = path.resolve(
    backendDir,
    'utils',
    'master-data-governance-write.ts',
  );
  const executionPlanPath = path.resolve(
    repoRoot,
    'docs',
    'master-data-governance-execution-plan.md',
  );
  const acceptanceChecklistPath = path.resolve(
    repoRoot,
    'docs',
    'master-data-governance-acceptance-checklist.md',
  );
  const backlogConfigPath = path.resolve(
    backendDir,
    'config',
    'master-data-governance-backlog.json',
  );

  const backlogReportPath = await pickLatestJsonFile(
    backlogDir,
    /^backlog-report-.*\.json$/,
  );
  const consistencyReportPath =
    (await pickLatestJsonFile(
      consistencyDir,
      /consistency-report-.*-acceptance\.json$/,
    )) || (await pickLatestJsonFile(consistencyDir));
  const fields = listMasterDataGovernanceFields();
  const waves = listMasterDataGovernanceWaves();
  const waveReportPaths = new Map<number, null | string>();
  for (const wave of waves) {
    const waveFieldKeys = fields
      .filter((field) => field.rolloutWave === wave)
      .map((field) => field.key);
    const reportPath = await pickLatestWaveEvidenceReport(
      reportsDir,
      wave,
      waveFieldKeys,
    );
    waveReportPaths.set(wave, reportPath);
  }
  const writeCoverageReportPath = await pickLatestJsonFile(writeCoverageDir);
  const readCoverageReportPath = await pickLatestJsonFile(readCoverageDir);

  const canonicalFields = fields.filter((field) => Boolean(field.canonical));
  const byWave = waves.map((wave) => ({
    wave,
    count: fields.filter((field) => field.rolloutWave === wave).length,
  }));

  const items: AuditItem[] = [];
  const evidencePaths: Record<string, null | string> = {
    backlogReportPath,
    consistencyReportPath,
    readCoverageReportPath,
    writeCoverageReportPath,
  };
  for (const wave of waves) {
    evidencePaths[`wave${wave}ReportPath`] = waveReportPaths.get(wave) || null;
  }

  const hasCoreArtifacts = await Promise.all([
    fileExists(registryPath),
    fileExists(writeHelperPath),
    fileExists(acceptanceScriptPath),
    fileExists(templateGeneratorPath),
    fileExists(templateVerifierPath),
    fileExists(releaseGatePath),
    fileExists(executionPlanPath),
    fileExists(acceptanceChecklistPath),
    fileExists(baselinePath),
  ]);
  const [
    hasRegistry,
    hasWriteHelper,
    hasAcceptanceScript,
    hasTemplateGenerator,
    hasTemplateVerifier,
    hasReleaseGate,
    hasExecutionPlan,
    hasAcceptanceChecklist,
    hasBaseline,
  ] = hasCoreArtifacts;

  pushItem(items, {
    key: 'phase0-baseline-freeze',
    requirement: 'Phase 0: 基线盘点与冻结',
    status: hasBaseline ? 'pass' : 'fail',
    detail: hasBaseline
      ? 'baseline 文件已存在，可追溯字段/来源/读写路径盘点。'
      : '缺少 baseline 文件，无法证明完成基线盘点。',
    evidence: {
      canonicalBaselinePath,
      baselinePath,
      exists: hasBaseline,
    },
  });

  let writeCoverageReport: CoverageReport | null = null;
  if (writeCoverageReportPath) {
    writeCoverageReport = await readJson<CoverageReport>(
      writeCoverageReportPath,
    );
  }
  let readCoverageReport: CoverageReport | null = null;
  if (readCoverageReportPath) {
    readCoverageReport = await readJson<CoverageReport>(readCoverageReportPath);
  }
  const writeMissingHits = Number(
    writeCoverageReport?.totals.totalMissingHits ?? Number.NaN,
  );
  const readMissingHits = Number(
    readCoverageReport?.totals.totalMissingHits ?? Number.NaN,
  );
  pushItem(items, {
    key: 'objective-write-coverage',
    requirement: '统一入口目标：写路径治理覆盖',
    status:
      Number.isFinite(writeMissingHits) && writeMissingHits === 0
        ? 'pass'
        : 'fail',
    detail:
      Number.isFinite(writeMissingHits) && writeMissingHits === 0
        ? '写路径覆盖报告存在且 totalMissingHits=0。'
        : '写路径覆盖报告缺失或存在 missing hits。',
    evidence: {
      totalMissingHits: writeMissingHits,
      writeCoverageReportPath,
    },
  });
  pushItem(items, {
    key: 'objective-read-coverage',
    requirement: '统一链路目标：canonical 读路径覆盖',
    status:
      Number.isFinite(readMissingHits) && readMissingHits === 0
        ? 'pass'
        : 'fail',
    detail:
      Number.isFinite(readMissingHits) && readMissingHits === 0
        ? '读路径覆盖报告存在且 totalMissingHits=0。'
        : '读路径覆盖报告缺失或存在 missing hits。',
    evidence: {
      readCoverageReportPath,
      totalMissingHits: readMissingHits,
    },
  });

  pushItem(items, {
    key: 'phaseA-governance-kernel',
    requirement: 'Phase A: 字段无关治理内核',
    status:
      hasRegistry && hasWriteHelper && hasAcceptanceScript ? 'pass' : 'fail',
    detail:
      hasRegistry && hasWriteHelper && hasAcceptanceScript
        ? '注册中心、写入 helper、验收脚本均已存在。'
        : '治理内核关键组件不完整。',
    evidence: {
      hasAcceptanceScript,
      hasRegistry,
      hasWriteHelper,
    },
  });

  pushItem(items, {
    key: 'phaseB-template-scaffold',
    requirement: 'Phase B: 自动化脚手架',
    status: hasTemplateGenerator && hasTemplateVerifier ? 'pass' : 'fail',
    detail:
      hasTemplateGenerator && hasTemplateVerifier
        ? '模板生成器与验证器均已具备。'
        : '模板生成/验证组件缺失。',
    evidence: {
      hasTemplateGenerator,
      hasTemplateVerifier,
    },
  });

  pushItem(items, {
    key: 'phaseC-wave-evidence',
    requirement: 'Phase C: 每波闭环证据',
    status: waves.every((wave) => Boolean(waveReportPaths.get(wave)))
      ? 'pass'
      : 'fail',
    detail: waves.every((wave) => Boolean(waveReportPaths.get(wave)))
      ? '所有 wave 均存在 release evidence 报告。'
      : '缺失部分 wave release evidence 报告。',
    evidence: {
      waveReportPaths: Object.fromEntries(
        waves.map((wave) => [wave, waveReportPaths.get(wave) || null]),
      ),
    },
  });

  let backlogReport: BacklogReport | null = null;
  if (backlogReportPath) {
    backlogReport = await readJson<BacklogReport>(backlogReportPath);
  }
  let consistencyReport: ConsistencyReport | null = null;
  if (consistencyReportPath) {
    consistencyReport = await readJson<ConsistencyReport>(
      consistencyReportPath,
    );
  }

  const actionablePending = Number(
    backlogReport?.summary.actionablePendingFields ??
      (backlogReport
        ? backlogReport.statusBreakdown.planned +
          backlogReport.statusBreakdown.deferred +
          backlogReport.summary.undecidedFields
        : Number.NaN),
  );
  const allAligned = Boolean(consistencyReport?.summary.allAligned);
  const totalMissingCanonicalId = Number(
    consistencyReport?.summary.totalMissingCanonicalId ?? Number.NaN,
  );
  const totalInvalidCanonicalId = Number(
    consistencyReport?.summary.totalInvalidCanonicalId ?? Number.NaN,
  );
  const totalOrphanValues = Number(
    consistencyReport?.summary.totalOrphanValues ?? Number.NaN,
  );
  const backlogDecisionConfig = await readJson<BacklogDecisionConfig>(
    backlogConfigPath,
  ).catch(() => null);
  const backlogDecisionByKey = new Map(
    (backlogDecisionConfig?.decisions || [])
      .map((item) => ({
        key: String(item.key || '').trim(),
        status: String(item.status || '').trim(),
      }))
      .filter((item) => Boolean(item.key))
      .map((item) => [item.key, item.status]),
  );
  const missingSupervisionExclusions =
    REQUIRED_SUPERVISION_EXCLUDED_KEYS.filter(
      (key) => backlogDecisionByKey.get(key) !== 'excluded',
    );

  pushItem(items, {
    key: 'objective-data-quality',
    requirement: '数据质量目标（empty/invalid/orphan 归零）',
    status:
      Number.isFinite(totalMissingCanonicalId) &&
      Number.isFinite(totalInvalidCanonicalId) &&
      Number.isFinite(totalOrphanValues) &&
      allAligned &&
      totalMissingCanonicalId === 0 &&
      totalInvalidCanonicalId === 0 &&
      totalOrphanValues === 0
        ? 'pass'
        : 'fail',
    detail:
      allAligned &&
      totalMissingCanonicalId === 0 &&
      totalInvalidCanonicalId === 0 &&
      totalOrphanValues === 0
        ? '迁移范围一致性三指标已归零。'
        : '一致性指标未达标或缺少可用报告。',
    evidence: {
      allAligned,
      consistencyReportPath,
      totalInvalidCanonicalId,
      totalMissingCanonicalId,
      totalOrphanValues,
    },
  });

  pushItem(items, {
    key: 'objective-actionable-pending',
    requirement: '可行动治理字段清零（planned/deferred/undecided）',
    status:
      Number.isFinite(actionablePending) && actionablePending === 0
        ? 'pass'
        : 'fail',
    detail:
      Number.isFinite(actionablePending) && actionablePending === 0
        ? '可行动未完成字段已清零。'
        : '仍存在可行动未完成字段，或缺少 backlog 报告。',
    evidence: {
      actionablePendingFields: actionablePending,
      backlogReportPath,
      breakdown: backlogReport?.statusBreakdown || null,
    },
  });

  const excludedBreakdownRaw = backlogReport?.summary.excludedBreakdown;
  const excludedBreakdown = excludedBreakdownRaw
    ? {
        covered_by_governance: toFiniteNonNegativeInt(
          excludedBreakdownRaw.covered_by_governance,
        ),
        canonical_source: toFiniteNonNegativeInt(
          excludedBreakdownRaw.canonical_source,
        ),
        system_metadata: toFiniteNonNegativeInt(
          excludedBreakdownRaw.system_metadata,
        ),
        business_excluded: toFiniteNonNegativeInt(
          excludedBreakdownRaw.business_excluded,
        ),
        other: toFiniteNonNegativeInt(excludedBreakdownRaw.other),
      }
    : null;
  const excludedBreakdownValues = excludedBreakdown
    ? Object.values(excludedBreakdown)
    : [];
  const hasCompleteExcludedBreakdown =
    excludedBreakdownValues.length > 0 &&
    excludedBreakdownValues.every((value) => value !== null);
  const excludedBreakdownTotal = hasCompleteExcludedBreakdown
    ? excludedBreakdownValues.reduce((sum, value) => sum + Number(value), 0)
    : null;
  const excludedCountFromStatus = Number(
    backlogReport?.statusBreakdown.excluded ?? Number.NaN,
  );
  const hasExcludedConsistency =
    Number.isFinite(excludedCountFromStatus) &&
    excludedBreakdownTotal !== null &&
    excludedBreakdownTotal === excludedCountFromStatus;
  pushItem(items, {
    key: 'objective-excluded-breakdown-consistency',
    requirement: 'excluded 分类口径一致性（excludedBreakdown 总和=excluded）',
    status: hasExcludedConsistency ? 'pass' : 'fail',
    detail: hasExcludedConsistency
      ? 'backlog 报告 excluded 分类口径与状态总数一致。'
      : 'backlog 报告缺少 excludedBreakdown 或分类总和与 excluded 不一致。',
    evidence: {
      backlogReportPath,
      excludedBreakdown,
      excludedBreakdownTotal,
      excludedCountFromStatus,
      hasCompleteExcludedBreakdown,
    },
  });

  pushItem(items, {
    key: 'wave10-supervision-exclusion-guard',
    requirement: 'Wave10: 用户排除的7个 supervision 字段保持 excluded',
    status: missingSupervisionExclusions.length === 0 ? 'pass' : 'fail',
    detail:
      missingSupervisionExclusions.length === 0
        ? '7个 supervision 字段仍保持 excluded。'
        : `以下字段不再是 excluded：${missingSupervisionExclusions.join(', ')}`,
    evidence: {
      backlogConfigPath,
      missingSupervisionExclusions,
      requiredSupervisionExcludedKeys: REQUIRED_SUPERVISION_EXCLUDED_KEYS,
    },
  });

  pushItem(items, {
    key: 'objective-release-gate',
    requirement: '生产安全目标（发布前强门禁）',
    status: hasReleaseGate && hasAcceptanceScript ? 'pass' : 'fail',
    detail:
      hasReleaseGate && hasAcceptanceScript
        ? 'release gate 与 acceptance gate 脚本均存在。'
        : 'release/acceptance 关键脚本不完整。',
    evidence: {
      hasAcceptanceScript,
      hasReleaseGate,
      releaseGatePath,
    },
  });

  const releaseGateContent = hasReleaseGate
    ? await fs.readFile(releaseGatePath, 'utf8')
    : '';
  const requiredGateTokens = [
    'check:type',
    'lint',
    'check:qms-arch',
    'master-data-consistency',
    'master-data-acceptance',
    'master-data-write-coverage',
    'master-data-read-coverage',
    'master-data-derived-rules',
    ...waves.map((wave) => `master-data-evidence-gate-wave${wave}`),
  ];
  const hasDynamicWaveToken = releaseGateContent.includes(
    'master-data-evidence-gate-wave' + '$' + '{wave}',
  );
  const missingGateTokens = requiredGateTokens.filter(
    (token) =>
      !releaseGateContent.includes(token) &&
      !(
        hasDynamicWaveToken &&
        token.startsWith('master-data-evidence-gate-wave')
      ),
  );
  pushItem(items, {
    key: 'release-gate-coverage',
    requirement: '发布门禁步骤覆盖（目标定义项）',
    status: missingGateTokens.length === 0 ? 'pass' : 'fail',
    detail:
      missingGateTokens.length === 0
        ? '发布门禁已覆盖目标定义的关键步骤。'
        : `发布门禁缺少步骤：${missingGateTokens.join(', ')}`,
    evidence: {
      missingGateTokens,
      requiredGateTokens,
    },
  });

  const checkGovernancePath = path.resolve(
    repoRoot,
    'scripts',
    'check-master-data-governance.mjs',
  );
  const checkGovernanceContent = await fs.readFile(checkGovernancePath, 'utf8');
  const hasFreezeRule =
    checkGovernanceContent.includes('direct field mapping token') &&
    checkGovernanceContent.includes('forbidden');
  pushItem(items, {
    key: 'rule-freeze-direct-mapping',
    requirement: '防回退：禁止手写 name/id 映射',
    status: hasFreezeRule ? 'pass' : 'fail',
    detail: hasFreezeRule
      ? '冻结门禁已实现 direct mapping 阻断。'
      : '冻结门禁未检测到 direct mapping 阻断规则。',
    evidence: {
      checkGovernancePath,
      hasFreezeRule,
    },
  });

  const helperAlignmentPath = path.resolve(
    backendDir,
    'scripts',
    'check-master-data-helper-alignment.ts',
  );
  const helperSurfacePath = path.resolve(
    backendDir,
    'scripts',
    'check-master-data-helper-surface.ts',
  );
  const deferredPath = path.resolve(
    backendDir,
    'scripts',
    'check-master-data-deferred-write-paths.ts',
  );
  pushItem(items, {
    key: 'rule-governance-helper-enforced',
    requirement: '防回退：必须走治理 helper / 注册中心',
    status:
      (await fileExists(helperAlignmentPath)) &&
      (await fileExists(helperSurfacePath)) &&
      (await fileExists(deferredPath))
        ? 'pass'
        : 'fail',
    detail:
      (await fileExists(helperAlignmentPath)) &&
      (await fileExists(helperSurfacePath)) &&
      (await fileExists(deferredPath))
        ? 'helper 对齐/表面/deferred 门禁齐备。'
        : 'helper 约束脚本缺失。',
    evidence: {
      deferredPath,
      helperAlignmentPath,
      helperSurfacePath,
    },
  });

  const runGovernancePath = path.resolve(
    backendDir,
    'scripts',
    'run-master-data-governance.ts',
  );
  const runGovernanceContent = await fs.readFile(runGovernancePath, 'utf8');
  const hasBatchResumeOptions =
    runGovernanceContent.includes('backfillBatchSize') &&
    runGovernanceContent.includes('backfillMaxRowsPerTable') &&
    runGovernanceContent.includes('backfillMaxBatchesPerTable') &&
    runGovernanceContent.includes('backfillStartAfterIdsByTable');
  pushItem(items, {
    key: 'rule-backfill-idempotent-resumable-batch',
    requirement: '防回退：回填必须支持幂等/断点/分批',
    status: hasBatchResumeOptions ? 'pass' : 'fail',
    detail: hasBatchResumeOptions
      ? '统一回填入口支持批量、限流与断点游标参数。'
      : '回填入口未检测到完整断点/分批参数支持。',
    evidence: {
      hasBatchResumeOptions,
      runGovernancePath,
    },
  });

  const waveReports: Array<{ path: null | string; wave: number }> = waves.map(
    (wave) => ({
      wave,
      path: waveReportPaths.get(wave) || null,
    }),
  );
  const missingWaveAuditEvidence: number[] = [];
  for (const item of waveReports) {
    if (!item.path) {
      missingWaveAuditEvidence.push(item.wave);
      continue;
    }
    const report = await readJson<GovernanceReport>(item.path);
    if (!Array.isArray(report.configKeys) || report.configKeys.length === 0) {
      missingWaveAuditEvidence.push(item.wave);
    }
  }
  pushItem(items, {
    key: 'rule-field-migration-evidence',
    requirement: '防回退：字段迁移附带测试与审计证据',
    status: missingWaveAuditEvidence.length === 0 ? 'pass' : 'warn',
    detail:
      missingWaveAuditEvidence.length === 0
        ? '所有 wave 均具备治理证据报告。'
        : `以下波次缺少可识别 evidence 报告：${missingWaveAuditEvidence.join(', ')}`,
    evidence: {
      missingWaveAuditEvidence,
      waveReports,
    },
  });

  pushItem(items, {
    key: 'final-default-read-canonical',
    requirement: '最终验收：默认读路径 canonical id',
    status: canonicalFields.length > 0 ? 'pass' : 'warn',
    detail:
      canonicalFields.length > 0
        ? '已存在 canonical-first 字段并纳入 read coverage 门禁。'
        : '尚未检测到 canonical-first 字段。',
    evidence: {
      canonicalFieldCount: canonicalFields.length,
    },
  });

  const compatibilityPlanExists = hasExecutionPlan && hasAcceptanceChecklist;
  pushItem(items, {
    key: 'final-compatibility-rollback-doc',
    requirement: '最终验收：兼容层策略与回退预案文档',
    status: compatibilityPlanExists ? 'pass' : 'warn',
    detail: compatibilityPlanExists
      ? '执行蓝图与验收清单文档已落地。'
      : '兼容层/回退策略文档不足。',
    evidence: {
      acceptanceChecklistPath,
      executionPlanPath,
      hasAcceptanceChecklist,
      hasExecutionPlan,
    },
  });

  const summary: ObjectiveAuditSummary = {
    fail: items.filter((item) => item.status === 'fail').length,
    pass: items.filter((item) => item.status === 'pass').length,
    warn: items.filter((item) => item.status === 'warn').length,
  };
  const nameOnlyFields = fields.filter(
    (field) => field.readStrategy === 'name-only',
  );
  const quantified: GovernanceQuantifiedResult = {
    total_fields: fields.length,
    canonical_fields: canonicalFields.length,
    name_only_fields: nameOnlyFields.length,
    excluded_total: Number.isFinite(excludedCountFromStatus)
      ? excludedCountFromStatus
      : null,
    excluded_covered_by_governance:
      excludedBreakdown?.covered_by_governance ?? null,
    excluded_canonical_source: excludedBreakdown?.canonical_source ?? null,
    excluded_system_metadata: excludedBreakdown?.system_metadata ?? null,
    excluded_business_excluded: excludedBreakdown?.business_excluded ?? null,
    excluded_other: excludedBreakdown?.other ?? null,
    gate_pass_count: summary.pass,
    gate_fail_count: summary.fail,
    orphan_values: Number.isFinite(totalOrphanValues)
      ? totalOrphanValues
      : null,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    summary,
    quantified,
    metrics: {
      byWave,
      canonicalFieldCount: canonicalFields.length,
      totalFields: fields.length,
    },
    evidencePaths,
    items,
  };

  const outDir = path.resolve(tmpDir, 'objective-audit');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(
    outDir,
    `objective-audit-${new Date()
      .toISOString()
      .replaceAll(':', '-')
      .replaceAll('.', '-')}.json`,
  );
  await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.warn('[check-master-data-objective-audit] result');
  console.warn(
    JSON.stringify(
      {
        outPath,
        summary,
        quantified,
      },
      null,
      2,
    ),
  );

  if (summary.fail > 0 || (failOnWarn && summary.warn > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('[check-master-data-objective-audit] failed', error);
  process.exitCode = 1;
});
