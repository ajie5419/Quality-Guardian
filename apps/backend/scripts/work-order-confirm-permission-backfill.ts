import type { Prisma } from '@prisma/client';

import { createId } from '@paralleldrive/cuid2';
import { PERMISSION_CODES, QMS_ROLE_NAMES } from '@qgs/shared';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const WORK_ORDER_INSPECTOR_PERMISSIONS = [
  PERMISSION_CODES.QMS.WORK_ORDER.LIST,
  PERMISSION_CODES.QMS.WORK_ORDER.CONFIRM,
] as const;
const WORK_ORDER_PERMISSION_CODES = [
  ...WORK_ORDER_INSPECTOR_PERMISSIONS,
  PERMISSION_CODES.QMS.WORK_ORDER.EDIT,
] as const;
type WorkOrderInspectorPermission =
  (typeof WORK_ORDER_INSPECTOR_PERMISSIONS)[number];

export type WorkOrderConfirmPermissionBackfillMode = 'apply' | 'dry-run';

export interface WorkOrderConfirmPermissionBackfillSummary {
  alreadyGrantedRoleCount: number;
  candidateRoleCount: number;
  createdRolePermissionCount: number;
  mode: WorkOrderConfirmPermissionBackfillMode;
  pendingRoleCount: number;
}

export function parseWorkOrderConfirmPermissionBackfillMode(
  args: string[],
): WorkOrderConfirmPermissionBackfillMode {
  let mode: WorkOrderConfirmPermissionBackfillMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return mode;
}

async function loadEligibleRoles(db: Pick<Prisma.TransactionClient, 'roles'>) {
  return db.roles.findMany({
    where: {
      isDeleted: false,
      status: 1,
      OR: [
        { name: QMS_ROLE_NAMES.INSPECTOR },
        {
          rbac_role_permissions: {
            some: {
              permission: {
                code: PERMISSION_CODES.QMS.WORK_ORDER.EDIT,
                isDeleted: false,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      rbac_role_permissions: {
        where: {
          permission: {
            code: { in: [...WORK_ORDER_PERMISSION_CODES] },
            isDeleted: false,
          },
        },
        select: { permission: { select: { code: true } } },
      },
    },
  });
}

function buildSummary(
  mode: WorkOrderConfirmPermissionBackfillMode,
  roles: Awaited<ReturnType<typeof loadEligibleRoles>>,
) {
  const missingPermissionsByRole = roles.map((role) => {
    const grantedCodes = new Set(
      role.rbac_role_permissions.map((link) => link.permission.code),
    );
    const targetPermissions: WorkOrderInspectorPermission[] = [];
    if (role.name === QMS_ROLE_NAMES.INSPECTOR) {
      targetPermissions.push(...WORK_ORDER_INSPECTOR_PERMISSIONS);
    } else if (grantedCodes.has(PERMISSION_CODES.QMS.WORK_ORDER.EDIT)) {
      targetPermissions.push(PERMISSION_CODES.QMS.WORK_ORDER.CONFIRM);
    }
    return {
      targetCodes: targetPermissions,
      missingCodes: targetPermissions.filter((code) => !grantedCodes.has(code)),
      roleId: role.id,
    };
  });
  const eligibleRoles = missingPermissionsByRole.filter(
    (role) => role.targetCodes.length > 0,
  );
  const pendingRoles = eligibleRoles.filter(
    (role) => role.missingCodes.length > 0,
  );
  const summary = {
    alreadyGrantedRoleCount: eligibleRoles.length - pendingRoles.length,
    candidateRoleCount: eligibleRoles.length,
    createdRolePermissionCount: 0,
    mode,
    pendingRoleCount: pendingRoles.length,
  } satisfies WorkOrderConfirmPermissionBackfillSummary;
  return {
    missingPermissionsByRole: eligibleRoles,
    pendingRoles,
    summary,
  };
}

export async function backfillWorkOrderConfirmPermission(
  mode: WorkOrderConfirmPermissionBackfillMode,
): Promise<WorkOrderConfirmPermissionBackfillSummary> {
  if (mode === 'dry-run') {
    const roles = await loadEligibleRoles(prisma);
    return buildSummary(mode, roles).summary;
  }

  await ensureModuleMenus();
  const result = await prisma.$transaction(async (tx) => {
    const roles = await loadEligibleRoles(tx);
    const { missingPermissionsByRole, pendingRoles, summary } = buildSummary(
      mode,
      roles,
    );
    const permissions = await Promise.all(
      WORK_ORDER_INSPECTOR_PERMISSIONS.map(async (code) => {
        const permission = await tx.rbac_permissions.upsert({
          where: { code },
          update: { isDeleted: false, module: 'QMS', name: code },
          create: {
            code,
            id: `rbac-perm-${createId()}`,
            isDeleted: false,
            module: 'QMS',
            name: code,
          },
          select: { id: true },
        });
        return [code, permission.id] as const;
      }),
    );
    const permissionIds = new Map(permissions);
    const links = missingPermissionsByRole.flatMap((role) =>
      role.missingCodes.map((code) => {
        const permissionId = permissionIds.get(code);
        if (!permissionId) {
          throw new Error(`permission not resolved: ${code}`);
        }
        return {
          id: `rbac-rp-${createId()}`,
          permissionId,
          roleId: role.roleId,
        };
      }),
    );
    const linkResult =
      links.length === 0
        ? { count: 0 }
        : await tx.rbac_role_permissions.createMany({
            data: links,
            skipDuplicates: true,
          });
    return {
      createdRolePermissionCount: linkResult.count,
      pendingRoleCount: pendingRoles.length,
      summary,
    };
  });

  if (result.pendingRoleCount > 0) {
    await redis.delByPattern('qms:menu:*');
  }

  return {
    ...result.summary,
    createdRolePermissionCount: result.createdRolePermissionCount,
  };
}
