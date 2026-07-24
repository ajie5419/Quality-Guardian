import { createId } from '@paralleldrive/cuid2';
import { getPagePermissionRequirements } from '~/modules/rbac/rbac-permission-hierarchy';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const ROLE_BATCH_SIZE = 200;

export type RolePagePermissionBackfillMode = 'apply' | 'dry-run';

export interface RolePagePermissionBackfillSummary {
  alreadyGrantedRoleCount: number;
  candidateRoleCount: number;
  createdRolePermissionCount: number;
  mode: RolePagePermissionBackfillMode;
  pendingRolePermissionCount: number;
  pendingRoleCount: number;
  scannedRoleCount: number;
}

export function parseRolePagePermissionBackfillMode(
  args: string[],
): RolePagePermissionBackfillMode {
  let mode: RolePagePermissionBackfillMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return mode;
}

export async function backfillRolePagePermissions(
  mode: RolePagePermissionBackfillMode,
): Promise<RolePagePermissionBackfillSummary> {
  if (mode === 'apply') {
    await ensureModuleMenus();
  }
  const menus = await prisma.menus.findMany({
    where: { isDeleted: false, status: 1 },
    select: { authCode: true, id: true, parentId: true, type: true },
  });
  const requirements = getPagePermissionRequirements(menus);
  const pageByButton = new Map(
    requirements.map(({ pagePermission, permission }) => [
      permission,
      pagePermission,
    ]),
  );

  let alreadyGrantedRoleCount = 0;
  let candidateRoleCount = 0;
  let createdRolePermissionCount = 0;
  let cursor: string | undefined;
  let pendingRoleCount = 0;
  let pendingRolePermissionCount = 0;
  let scannedRoleCount = 0;
  const pagePermissionIds = new Map<string, string>();

  while (true) {
    const roles = await prisma.roles.findMany({
      where: { isDeleted: false },
      orderBy: { id: 'asc' },
      take: ROLE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        rbac_role_permissions: {
          where: { permission: { isDeleted: false } },
          select: { permission: { select: { code: true } } },
        },
      },
    });
    if (roles.length === 0) break;

    scannedRoleCount += roles.length;
    const pending: Array<{ pageCode: string; roleId: string }> = [];
    for (const role of roles) {
      const codes = new Set(
        role.rbac_role_permissions.map((link) => link.permission.code),
      );
      const selectedButtons = [...codes].filter((code) =>
        pageByButton.has(code),
      );
      if (selectedButtons.length === 0) continue;

      candidateRoleCount += 1;
      const missingPages = new Set(
        selectedButtons
          .map((code) => pageByButton.get(code))
          .filter(
            (pageCode): pageCode is string =>
              Boolean(pageCode) && !codes.has(pageCode),
          ),
      );
      if (missingPages.size === 0) {
        alreadyGrantedRoleCount += 1;
        continue;
      }
      pendingRoleCount += 1;
      pendingRolePermissionCount += missingPages.size;
      for (const pageCode of missingPages) {
        pending.push({ pageCode, roleId: role.id });
      }
    }

    if (mode === 'apply' && pending.length > 0) {
      for (const pageCode of new Set(pending.map((item) => item.pageCode))) {
        if (pagePermissionIds.has(pageCode)) continue;
        const permission = await prisma.rbac_permissions.upsert({
          where: { code: pageCode },
          update: { isDeleted: false, name: pageCode },
          create: {
            code: pageCode,
            id: `rbac-perm-${createId()}`,
            isDeleted: false,
            module: pageCode.split(':')[0] || 'QMS',
            name: pageCode,
          },
          select: { id: true },
        });
        pagePermissionIds.set(pageCode, permission.id);
      }
      const result = await prisma.rbac_role_permissions.createMany({
        data: pending.map(({ pageCode, roleId }) => {
          const permissionId = pagePermissionIds.get(pageCode);
          if (!permissionId) {
            throw new Error(`page permission not resolved: ${pageCode}`);
          }
          return {
            id: `rbac-rp-${createId()}`,
            permissionId,
            roleId,
          };
        }),
        skipDuplicates: true,
      });
      createdRolePermissionCount += result.count;
    }

    cursor = roles.at(-1)?.id;
    if (roles.length < ROLE_BATCH_SIZE) break;
  }

  if (mode === 'apply' && pendingRolePermissionCount > 0) {
    await redis.delByPattern('qms:menu:*');
  }

  return {
    alreadyGrantedRoleCount,
    candidateRoleCount,
    createdRolePermissionCount,
    mode,
    pendingRoleCount,
    pendingRolePermissionCount,
    scannedRoleCount,
  };
}
