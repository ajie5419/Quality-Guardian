import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '@prisma/client';
import {
  AI_GENERATION_PERMISSION_CODES,
  DASHBOARD_PERMISSION_CODES,
  INSPECTION_ISSUE_PERMISSION_CODES,
  INSPECTION_RECORD_PERMISSION_CODES,
  INSPECTION_REQUEST_PERMISSION_CODES,
  KNOWLEDGE_PERMISSION_CODES,
  METROLOGY_PERMISSION_CODES,
  PERMISSION_CODES,
  REPORTS_PERMISSION_CODES,
  SUPERVISION_PERMISSION_CODES,
  TASK_DISPATCH_PERMISSION_CODES,
  VEHICLE_COMMISSIONING_WRITE_CODES,
  WELDER_PERMISSION_CODES,
} from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';

/**
 * One-shot consistency backfill: make every active menu authCode assignable
 * by ensuring a matching rbac_permissions row exists, then grant the newly
 * added codes to every active role (zero-regression default; business
 * tightening is done via the role management UI).
 *
 * Also grants codes that backend authorization (authorizeWrite) references
 * but that only existed in menus before (e.g. material-request approval).
 *
 * Usage:
 *   pnpm --dir apps/backend exec tsx scripts/backfill-permission-consistency.ts
 */

const logger = createModuleLogger('BackfillPermissionConsistency');

const prisma = new PrismaClient();

async function main() {
  const menuCodes = await prisma.menus.findMany({
    select: { authCode: true },
    where: { isDeleted: false, status: 1, authCode: { not: null } },
  });
  function flattenCodes(value: unknown, out: string[] = []) {
    if (typeof value === 'string') {
      out.push(value);
      return out;
    }
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) flattenCodes(child, out);
    }
    return out;
  }

  const enumCodes = flattenCodes([
    PERMISSION_CODES,
    INSPECTION_ISSUE_PERMISSION_CODES,
    INSPECTION_RECORD_PERMISSION_CODES,
    INSPECTION_REQUEST_PERMISSION_CODES,
    METROLOGY_PERMISSION_CODES,
    KNOWLEDGE_PERMISSION_CODES,
    WELDER_PERMISSION_CODES,
    REPORTS_PERMISSION_CODES,
    TASK_DISPATCH_PERMISSION_CODES,
    VEHICLE_COMMISSIONING_WRITE_CODES,
    AI_GENERATION_PERMISSION_CODES,
    DASHBOARD_PERMISSION_CODES,
    SUPERVISION_PERMISSION_CODES,
  ]);
  const declared = [
    ...new Set([
      ...enumCodes,
      ...menuCodes.map((row) => String(row.authCode)).filter(Boolean),
    ]),
  ];

  const existing = await prisma.rbac_permissions.findMany({
    select: { code: true },
    where: { isDeleted: false },
  });
  const existingCodes = new Set(existing.map((row) => row.code));
  const missing = declared.filter((code) => !existingCodes.has(code));
  if (missing.length === 0) {
    logger.info('all menu-declared codes already present in rbac_permissions');
    return;
  }

  const permissionIdByCode = new Map<string, string>();
  for (const code of missing) {
    const permission = await prisma.rbac_permissions.upsert({
      where: { code },
      update: { isDeleted: false, name: code },
      create: {
        code,
        id: `rbac-perm-${createId()}`,
        isDeleted: false,
        module: code.split(':')[1]?.toLowerCase() || 'qms',
        name: code,
      },
      select: { id: true },
    });
    permissionIdByCode.set(code, permission.id);
  }
  logger.info(`upserted rbac_permissions: ${missing.join(', ')}`);

  const activeRoles = await prisma.roles.findMany({
    select: { id: true },
    where: { isDeleted: false, status: 1 },
  });
  let granted = 0;
  for (const role of activeRoles) {
    const created = await prisma.rbac_role_permissions.createMany({
      data: missing.map((code) => {
        const permissionId = permissionIdByCode.get(code);
        if (!permissionId) {
          throw new Error(`permission not resolved: ${code}`);
        }
        return {
          id: `rbac-rp-${createId()}`,
          permissionId,
          roleId: role.id,
        };
      }),
      skipDuplicates: true,
    });
    granted += created.count;
  }
  logger.info(
    `assigned ${granted} role-permission links across ${activeRoles.length} active roles`,
  );
  logger.info('backfill complete');
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'backfill failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
