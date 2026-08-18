import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import { PrismaClient } from '@prisma/client';
import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('BackfillInspectionRecordPermissions');

/**
 * Backfill inspection-record permission codes:
 * 1. Upsert any missing rows into rbac_permissions (keyed by code).
 * 2. Assign the codes to every active role so existing behaviour is
 *    preserved after the authorization framework goes live.
 *
 * Business tightening (removing codes from specific roles) is done later
 * through the role management UI, which enforces menu-declared codes.
 *
 * Usage:
 *   pnpm --dir apps/backend exec tsx scripts/backfill-inspection-record-permissions.ts
 */

const prisma = new PrismaClient();

const CODES = Object.values(INSPECTION_RECORD_PERMISSION_CODES);

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
        module: 'inspection',
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
