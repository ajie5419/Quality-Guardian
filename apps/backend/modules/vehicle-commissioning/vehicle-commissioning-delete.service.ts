import type { UserSession } from '~/utils/jwt-utils';

import { VEHICLE_COMMISSIONING_PERMISSION_CODES } from '@qgs/shared';
import { FileStorageService } from '~/modules/file-storage';
import { QualityLossIndexService } from '~/modules/quality-loss';
import { RbacService } from '~/modules/rbac';
import { SystemLogService } from '~/modules/system-log';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

export const VehicleCommissioningDeleteService = {
  async deleteIssue(id: string, userinfo: UserSession) {
    const userId = String(userinfo.userId ?? userinfo.id ?? '');
    const permissionCodes = userId
      ? await RbacService.getUserPermissionCodes(userId)
      : [];
    if (
      !permissionCodes.includes(VEHICLE_COMMISSIONING_PERMISSION_CODES.DELETE)
    ) {
      throw new BusinessError('FORBIDDEN', '无删除调试验收问题权限', 403);
    }

    const existing = await prisma.vehicle_commissioning_issues.findFirst({
      where: { id, isDeleted: false },
      select: { description: true, id: true },
    });
    if (!existing) {
      throw new BusinessError('NOT_FOUND', '调试验收问题不存在', 404);
    }

    const result = await prisma.vehicle_commissioning_issues.updateMany({
      where: { id, isDeleted: false },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BusinessError('NOT_FOUND', '调试验收问题不存在', 404);
    }

    await Promise.all([
      FileStorageService.softDeleteReferences({
        bizId: id,
        bizType: 'vehicle_commissioning_issue',
      }),
      QualityLossIndexService.softDeleteSource('Commissioning', id),
    ]);
    await SystemLogService.auditLog('vehicle-commissioning', 'issueDelete', {
      detailsVariables: { issue: existing.description || id },
      targetId: id,
      userId,
    });
  },
};
