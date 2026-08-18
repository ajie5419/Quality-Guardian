import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '@prisma/client';
import {
  AI_GENERATION_PERMISSION_CODES,
  DASHBOARD_PERMISSION_CODES,
  REPORTS_PERMISSION_CODES,
  TASK_DISPATCH_PERMISSION_CODES,
  VEHICLE_COMMISSIONING_WRITE_CODES,
} from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';

/**
 * Backfill the write-permission codes introduced by the authorization
 * framework Phase 2e (reports / task dispatch / vehicle commissioning /
 * AI / dashboard). Upserts rbac_permissions rows and grants the codes to
 * every active role so existing behaviour is preserved; business
 * tightening is done via the role management UI.
 *
 * Usage:
 *   pnpm --dir apps/backend exec tsx scripts/backfill-phase2e-permissions.ts
 */

const logger = createModuleLogger('BackfillPhase2ePermissions');

const prisma = new PrismaClient();

const CODES = [
  ...Object.values(REPORTS_PERMISSION_CODES),
  ...Object.values(TASK_DISPATCH_PERMISSION_CODES),
  ...Object.values(VEHICLE_COMMISSIONING_WRITE_CODES),
  ...Object.values(AI_GENERATION_PERMISSION_CODES),
  ...Object.values(DASHBOARD_PERMISSION_CODES),
];

async function main() {
  const existing = await prisma.rbac_permissions.findMany({
    select: { code: true },
    where: { isDeleted: false },
  });
  const existingCodes = new Set(existing.map((row) => row.code));
  const missing = CODES.filter((code) => !existingCodes.has(code));

  const permissionIdByCode = new Map<string, string>();
  for (const code of CODES) {
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
  if (missing.length > 0) {
    logger.info(`upserted rbac_permissions: ${missing.join(', ')}`);
  } else {
    logger.info('all permission codes already present');
  }

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
