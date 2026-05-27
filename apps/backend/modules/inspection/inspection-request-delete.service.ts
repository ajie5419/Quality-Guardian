import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

export const InspectionRequestDeleteService = {
  async deleteRequest(event: H3Event, id: string, userinfo: UserSession) {
    const existing = await prisma.qms_inspection_requests.findFirst({
      select: { dispatchTaskId: true, id: true, requestNo: true },
      where: { id, isDeleted: false },
    });
    if (!existing) throw new BusinessError('NOT_FOUND', '报检任务不存在', 404);

    await prisma.$transaction(async (tx) => {
      await tx.qms_inspection_requests.update({
        data: { isDeleted: true, updatedAt: new Date() },
        where: { id },
      });
      if (existing.dispatchTaskId)
        await tx.qms_task_dispatches.updateMany({
          data: { status: 'CANCELLED' },
          where: { id: existing.dispatchTaskId },
        });
    });

    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'inspection_request',
    });
    await recordBusinessAuditLog(event, {
      action: 'DELETE',
      detailsTemplate: '删除报检任务: {{requestNo}}',
      detailsVariables: { requestNo: existing.requestNo },
      targetId: id,
      targetType: 'inspection_request',
      userId: userinfo.id,
    });
  },
};
