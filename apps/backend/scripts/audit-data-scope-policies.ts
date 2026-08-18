import process from 'node:process';

import { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '~/utils/logger';

/**
 * Prints the current data-scope policy matrix (role x module) so business
 * owners can confirm scopes BEFORE enabling DATA_SCOPE_V2=true. Each role
 * without a policy row falls back to its department (DEPT) or SELF.
 *
 * Usage:
 *   pnpm --dir apps/backend exec tsx scripts/audit-data-scope-policies.ts
 */

const logger = createModuleLogger('AuditDataScopePolicies');

const prisma = new PrismaClient();

const SCOPED_MODULES = [
  'after-sales',
  'inspection',
  'quality-loss',
  'supplier',
  'work-order',
];

async function main() {
  const roles = await prisma.roles.findMany({
    select: { id: true, name: true },
    where: { isDeleted: false, status: 1 },
    orderBy: { name: 'asc' },
  });
  const policies = await prisma.data_permission_policies.findMany({
    select: { roleId: true, module: true, scopeType: true, deptIds: true },
    where: { isDeleted: false },
  });
  const byRoleModule = new Map<
    string,
    { deptIds: string; scopeType: string }
  >();
  for (const p of policies) {
    byRoleModule.set(`${p.roleId}:${p.module}`, {
      scopeType: p.scopeType,
      deptIds: p.deptIds ?? '',
    });
  }

  logger.info('数据范围策略矩阵（DATA_SCOPE_V2 开启前的核查清单）');
  logger.info(`模块: ${SCOPED_MODULES.join(' | ')}`);
  for (const role of roles) {
    const cells = SCOPED_MODULES.map((m) => {
      const policy = byRoleModule.get(`${role.id}:${m}`);
      if (!policy) return '未配置(回退部门/本人)';
      return policy.scopeType + (policy.deptIds ? `[${policy.deptIds}]` : '');
    });
    logger.info(`${role.name}: ${cells.join(' | ')}`);
  }
  logger.info('提示: 未配置行在开启后回退为 DEPT(用户部门) 或 SELF(本人)。');
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'audit failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
