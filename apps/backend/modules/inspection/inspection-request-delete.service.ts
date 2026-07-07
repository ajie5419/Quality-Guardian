import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { RbacService } from '~/modules/rbac/rbac.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  INSPECTION_REQUEST_STATUS,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';

// Same permission used by dispatch service — callers with dispatch rights may
// cancel any request regardless of ownership.
const DISPATCH_PERMISSION_CODE = 'QMS:Inspection:Requests:Dispatch';

export const InspectionRequestDeleteService = {
  async deleteRequest(event: H3Event, id: string, userinfo: UserSession) {
    // Load stable fields needed for ownership check and audit.
    // Status is NOT checked here; the authoritative status guard is
    // inside the transaction (atomic updateMany pattern per CONSTRAINTS.md).
    const existing = await prisma.qms_inspection_requests.findFirst({
      select: {
        dispatchTaskId: true,
        id: true,
        reporter: true,
        requestNo: true,
      },
      where: { id, isDeleted: false },
    });
    if (!existing) throw new BusinessError('NOT_FOUND', '报检任务不存在', 404);

    // Ownership check: the request creator (reporter username) may always
    // cancel; anyone with dispatch permission may cancel on their behalf.
    const isOwner = existing.reporter === userinfo.username;
    if (!isOwner) {
      const userId =
        userinfo.userId ||
        userinfo.id ||
        (await resolveInspectionRequestCurrentUserId(userinfo, prisma));
      const codes = userId
        ? await RbacService.getUserPermissionCodes(String(userId))
        : [];
      if (!codes.includes(DISPATCH_PERMISSION_CODE)) {
        throw new BusinessError('FORBIDDEN', '无权取消他人的报检任务', 403);
      }
    }

    // Atomic status guard + soft-delete inside one transaction.
    // updateMany with the status filter is the race-safe pattern: if a
    // concurrent request changed the status to INSPECTING or CLOSED, the
    // where clause won't match and count will be 0.
    await prisma.$transaction(async (tx) => {
      const result = await tx.qms_inspection_requests.updateMany({
        data: {
          isDeleted: true,
          status: INSPECTION_REQUEST_STATUS.CANCELLED,
          updatedAt: new Date(),
        },
        where: {
          id,
          isDeleted: false,
          status: {
            in: [
              INSPECTION_REQUEST_STATUS.SUBMITTED,
              INSPECTION_REQUEST_STATUS.DISPATCHED,
            ],
          },
        },
      });
      if (result.count === 0) {
        throw new BusinessError(
          'BAD_REQUEST',
          '报检任务当前状态不可取消（仅待检和已派单可取消）',
          400,
        );
      }
      if (existing.dispatchTaskId) {
        await tx.qms_task_dispatches.updateMany({
          data: { status: 'CANCELLED' },
          where: { id: existing.dispatchTaskId },
        });
      }
    });

    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'inspection_request',
    });
    await recordBusinessAuditLog(event, {
      action: 'DELETE',
      detailsTemplate: '取消报检任务: {{requestNo}}',
      detailsVariables: { requestNo: existing.requestNo },
      targetId: id,
      targetType: 'inspection_request',
      userId: userinfo.id,
    });
  },
};
