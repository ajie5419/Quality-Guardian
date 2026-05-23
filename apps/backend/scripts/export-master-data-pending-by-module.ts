import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildMasterDataGovernanceBacklogReport,
  resolveRepoRoot,
} from './export-master-data-governance-backlog';

type PendingStatus = 'deferred' | 'excluded' | 'planned' | 'undecided';

interface PendingFieldItem {
  fieldKey: string;
  fieldNameZh?: string;
  reason?: string;
  status: PendingStatus;
}

interface ModuleBreakdownItem {
  excludedCount: number;
  fields: PendingFieldItem[];
  moduleKey: string;
  moduleNameZh?: string;
  pendingCount: number;
}

export interface PendingByModuleOutput {
  generatedAt: string;
  summary: {
    moduleCount: number;
    totalExcluded: number;
    totalPending: number;
    totalUndecided: number;
  };
  modules: ModuleBreakdownItem[];
}

const MODULE_NAME_ZH: Record<string, string> = {
  after_sales: '售后',
  dictionary: '字典与主数据',
  inspection: '检验',
  knowledge: '知识库',
  standard_document: '标准文件',
  supervision: '监督',
  system: '系统元数据',
  welder: '焊工',
};

const FIELD_NAME_ZH: Record<string, string> = {
  'supervision_milestones.delayReason': '监督里程碑延期原因',
  'supervision_milestones.name': '监督里程碑名称',
  'supervision_plan_steps.stepName': '监督计划步骤名',
  'supervision_plan_tasks.resourceName': '监督计划任务资源名',
  'supervision_plan_tasks.riskReason': '监督风险原因',
  'supervision_plan_tasks.taskName': '监督计划任务名',
  'supervision_projects.participants': '监督参与方',
  'supervision_report_task_updates.riskReason': '监督风险原因',
  'supervision_report_task_updates.taskName': '监督计划任务名',
};

function resolveModuleKey(model: string) {
  if (model.startsWith('supervision_')) return 'supervision';
  if (model.startsWith('knowledge_')) return 'knowledge';
  if (
    model.startsWith('menu') ||
    model.startsWith('role') ||
    model.startsWith('permission') ||
    model.startsWith('rbac_') ||
    model.startsWith('user') ||
    model.startsWith('login_') ||
    model.startsWith('data_permission_') ||
    model.startsWith('sequence')
  ) {
    return 'system';
  }
  if (model === 'dictionaries' || model === 'departments') return 'dictionary';
  if (model.startsWith('standard_document')) return 'standard_document';
  if (model.startsWith('inspection') || model.startsWith('qms_inspection_')) {
    return 'inspection';
  }
  if (model.startsWith('welder')) return 'welder';
  if (model.startsWith('after_sales')) return 'after_sales';
  return model;
}

export function buildModuleBreakdown(
  report: Awaited<ReturnType<typeof buildMasterDataGovernanceBacklogReport>>,
) {
  const modules = new Map<string, ModuleBreakdownItem>();

  for (const field of report.pending) {
    const moduleKey = resolveModuleKey(field.model);
    const current = modules.get(moduleKey) || {
      moduleKey,
      moduleNameZh: MODULE_NAME_ZH[moduleKey],
      pendingCount: 0,
      excludedCount: 0,
      fields: [],
    };

    current.pendingCount += 1;
    if (field.status === 'excluded') current.excludedCount += 1;
    current.fields.push({
      fieldKey: field.key,
      fieldNameZh: FIELD_NAME_ZH[field.key],
      reason: field.decisionNote || undefined,
      status: field.status,
    });
    modules.set(moduleKey, current);
  }

  const moduleList = [...modules.values()];
  for (const module of moduleList) {
    module.fields.sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  }
  moduleList.sort((a, b) => {
    if (b.pendingCount !== a.pendingCount)
      return b.pendingCount - a.pendingCount;
    return a.moduleKey.localeCompare(b.moduleKey);
  });
  return moduleList;
}

export function buildPendingByModuleOutput(
  report: Awaited<ReturnType<typeof buildMasterDataGovernanceBacklogReport>>,
): PendingByModuleOutput {
  const modules = buildModuleBreakdown(report);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      moduleCount: modules.length,
      totalExcluded: report.statusBreakdown.excluded,
      totalPending: report.summary.pendingFields,
      totalUndecided: report.summary.undecidedFields,
    },
    modules,
  };
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const report = await buildMasterDataGovernanceBacklogReport({
    repoRoot,
    reportLabel: 'module-breakdown',
  });
  const output = buildPendingByModuleOutput(report);

  const outDir = path.resolve(
    repoRoot,
    'tmp',
    'master-data-governance',
    'backlog',
  );
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(
    outDir,
    `pending-by-module-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`,
  );
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const selfFile = fileURLToPath(import.meta.url);
if (entryFile === selfFile) {
  main().catch((error: unknown) => {
    console.error('[export-master-data-pending-by-module] failed', error);
    process.exitCode = 1;
  });
}
