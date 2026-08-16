import process from 'node:process';

import { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '~/utils/logger';

/**
 * Soft-delete legacy MENU_* placeholder permission codes and unlink them
 * from roles. These codes have no menu, no business reference and were
 * never assignable through the UI.
 *
 * Usage:
 *   pnpm --dir apps/backend exec tsx scripts/cleanup-menu-placeholder-codes.ts
 */

const logger = createModuleLogger('CleanupMenuPlaceholderCodes');

const prisma = new PrismaClient();

async function main() {
  const placeholders = await prisma.rbac_permissions.findMany({
    select: { id: true, code: true },
    where: { code: { startsWith: 'MENU_' }, isDeleted: false },
  });
  if (placeholders.length === 0) {
    logger.info('no MENU_ placeholder codes to clean up');
    return;
  }
  const ids = placeholders.map((row) => row.id);
  const unlinked = await prisma.rbac_role_permissions.deleteMany({
    where: { permissionId: { in: ids } },
  });
  const updated = await prisma.rbac_permissions.updateMany({
    where: { id: { in: ids } },
    data: { isDeleted: true },
  });
  logger.info(
    `soft-deleted ${updated.count} placeholder codes, unlinked ${unlinked.count} role links`,
  );
  logger.info('cleanup complete');
}

main()
  .catch((error: unknown) => {
    logger.error({ err: error }, 'cleanup failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
