import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('DataRetentionRule');

export type RetentionAction = 'ARCHIVE' | 'DELETE' | 'PURGE';

export interface RetentionRuleInput {
  action: RetentionAction;
  dataClass: string;
  displayName: string;
  retentionDays: number;
}

// 默认保留期（业务口径 2026-08-17 确认：业务数据至少 10 年）
export const DEFAULT_RETENTION_RULES: RetentionRuleInput[] = [
  {
    dataClass: 'audit-log',
    displayName: '审计/登录日志',
    retentionDays: 90,
    action: 'DELETE',
  },
  {
    dataClass: 'inspection-record',
    displayName: '检验记录/不合格品',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'inspection-request',
    displayName: '报检任务',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'metrology',
    displayName: '计量器具记录',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'after-sales',
    displayName: '售后记录',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'quality-loss',
    displayName: '质量损失',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'work-order',
    displayName: '工单',
    retentionDays: 3650,
    action: 'ARCHIVE',
  },
  {
    dataClass: 'snapshot',
    displayName: '物化快照/索引',
    retentionDays: 730,
    action: 'DELETE',
  },
  {
    dataClass: 'temp-file',
    displayName: '临时文件',
    retentionDays: 30,
    action: 'PURGE',
  },
];

/**
 * 幂等写入默认保留期规则（仅补缺失，不改已有）。
 */
export async function ensureDefaultRetentionRules(): Promise<void> {
  const existing = await prisma.data_retention_rules.findMany({
    where: { isDeleted: false },
    select: { dataClass: true },
  });
  const existingSet = new Set(existing.map((rule) => rule.dataClass));
  const missing = DEFAULT_RETENTION_RULES.filter(
    (rule) => !existingSet.has(rule.dataClass),
  );
  if (missing.length === 0) return;
  await prisma.data_retention_rules.createMany({
    data: missing,
    skipDuplicates: true,
  });
  logger.info({ added: missing.length }, 'default retention rules ensured');
}

export const DataRetentionRuleService = {
  async listRules() {
    return prisma.data_retention_rules.findMany({
      where: { isDeleted: false },
      orderBy: { dataClass: 'asc' },
    });
  },
  async updateRule(id: string, input: Partial<RetentionRuleInput>) {
    return prisma.data_retention_rules.update({
      where: { id },
      data: {
        ...(input.action ? { action: input.action } : {}),
        ...(input.retentionDays ? { retentionDays: input.retentionDays } : {}),
      },
    });
  },
};
