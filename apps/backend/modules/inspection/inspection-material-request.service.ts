import type { Prisma } from '@prisma/client';
import type { EventHandlerRequest, H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import type {
  InspectionMaterialRequestApproveInput,
  InspectionMaterialRequestListQuery,
  InspectionMaterialRequestRejectInput,
} from './inspection-material-request.schema';

import {
  INSPECTION_MATERIAL_PERMISSION_CODES,
  isSystemAdmin,
  TASK_DISPATCH_STATUS,
} from '@qgs/shared';
import { PartMasterService } from '~/modules/part-master';
import { RbacService } from '~/modules/rbac';
import { recordBusinessAuditLog } from '~/modules/system-log';
import { WxSubscribeMessageService } from '~/modules/user';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { notifyTelegramNewRequest } from '~/utils/telegram-bot';

import {
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';
import { publishInspectionRequestCreated } from './inspection-request-events';

export { INSPECTION_MATERIAL_PERMISSION_CODES };

async function assertPermission(
  user: UserSession,
  permission: string,
): Promise<void> {
  if (isSystemAdmin(user)) return;
  const userId = String(user.userId || user.id || '');
  const codes = userId ? await RbacService.getUserPermissionCodes(userId) : [];
  if (!codes.includes(permission)) {
    throw new BusinessError('FORBIDDEN', 'Permission denied', 403);
  }
}

function buildListWhere(query: InspectionMaterialRequestListQuery) {
  const keyword = query.keyword?.trim();
  return {
    inspectionRequest: { is: { isDeleted: false } },
    ...(query.status ? { status: query.status } : {}),
    ...(keyword
      ? {
          OR: [
            { requestedName: { contains: keyword } },
            {
              inspectionRequest: {
                is: {
                  OR: [
                    { reporter: { contains: keyword } },
                    { requestNo: { contains: keyword } },
                    { workOrderNumber: { contains: keyword } },
                    {
                      supplier: {
                        is: { name: { contains: keyword } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  } satisfies Prisma.qms_inspection_material_requestsWhereInput;
}

const materialListInclude = {
  inspectionRequest: {
    select: {
      id: true,
      reporter: true,
      requestNo: true,
      supplier: { select: { name: true } },
      team: true,
      workOrderNumber: true,
    },
  },
} satisfies Prisma.qms_inspection_material_requestsInclude;

function mapListItem(
  item: Prisma.qms_inspection_material_requestsGetPayload<{
    include: typeof materialListInclude;
  }>,
) {
  return {
    id: item.id,
    inspectionRequestId: item.inspectionRequestId,
    reporter: item.inspectionRequest.reporter,
    requestedName: item.requestedName,
    requestNo: item.inspectionRequest.requestNo,
    resolvedPartId: item.resolvedPartId,
    resolvedPartName: item.resolvedPartName,
    reviewRemark: item.reviewRemark,
    reviewedAt: item.reviewedAt,
    status: item.status,
    submittedAt: item.submittedAt,
    supplierName:
      item.inspectionRequest.supplier?.name ||
      item.inspectionRequest.team ||
      null,
    workOrderNumber: item.inspectionRequest.workOrderNumber,
  };
}

async function resolveReviewedById(user: UserSession) {
  const userId = await resolveInspectionRequestCurrentUserId(user, prisma);
  if (!userId) {
    throw new BusinessError(
      'REVIEWER_ID_REQUIRED',
      'Unable to resolve the current reviewer',
      400,
    );
  }
  return userId;
}

async function resolveApprovedPart(
  tx: Prisma.TransactionClient,
  application: { requestedName: string },
  input: InspectionMaterialRequestApproveInput,
) {
  if (input.mode === 'LINK_EXISTING') {
    return PartMasterService.assertActive(input.partId, tx);
  }
  return PartMasterService.create(
    { name: input.name?.trim() || application.requestedName, sort: 0 },
    tx,
  );
}

const resolvedRequestInclude = {
  dispatcher: { select: { realName: true, username: true } },
  inspector: { select: { realName: true, username: true } },
  materialRequest: {
    select: { requestedName: true, status: true },
  },
  process: { select: { name: true } },
} satisfies Prisma.qms_inspection_requestsInclude;

async function approveInTransaction(
  id: string,
  input: InspectionMaterialRequestApproveInput,
  reviewedById: string,
) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.qms_inspection_material_requests.findFirst({
      where: { id, status: 'PENDING' },
      select: {
        id: true,
        inspectionRequest: {
          select: { id: true, isDeleted: true, status: true },
        },
        requestedName: true,
      },
    });
    if (!application) {
      throw new BusinessError(
        'MATERIAL_REQUEST_NOT_PENDING',
        'The material request does not exist or has already been reviewed',
        409,
      );
    }
    if (
      application.inspectionRequest.isDeleted ||
      application.inspectionRequest.status !==
        INSPECTION_REQUEST_STATUS.SUBMITTED
    ) {
      throw new BusinessError(
        'INSPECTION_REQUEST_NOT_REVIEWABLE',
        'The linked inspection request cannot be reviewed',
        409,
      );
    }
    const part = await resolveApprovedPart(tx, application, input);
    const requestUpdate = await tx.qms_inspection_requests.updateMany({
      where: {
        id: application.inspectionRequest.id,
        isDeleted: false,
        partId: null,
        status: INSPECTION_REQUEST_STATUS.SUBMITTED,
      },
      data: { partId: part.id, partName: part.name },
    });
    if (requestUpdate.count === 0) {
      throw new BusinessError(
        'INSPECTION_REQUEST_CHANGED',
        'The linked inspection request changed during review',
        409,
      );
    }
    const approvalUpdate = await tx.qms_inspection_material_requests.updateMany(
      {
        where: { id, status: 'PENDING' },
        data: {
          resolutionMode: input.mode,
          resolvedPartId: part.id,
          resolvedPartName: part.name,
          reviewedAt: new Date(),
          reviewedById,
          reviewRemark: input.remark?.trim() || null,
          status: 'APPROVED',
        },
      },
    );
    if (approvalUpdate.count === 0) {
      throw new BusinessError(
        'MATERIAL_REQUEST_CHANGED',
        'The material request changed during review',
        409,
      );
    }
    return tx.qms_inspection_requests.findUniqueOrThrow({
      where: { id: application.inspectionRequest.id },
      include: resolvedRequestInclude,
    });
  });
}

export const InspectionMaterialRequestService = {
  async list(user: UserSession, query: InspectionMaterialRequestListQuery) {
    await assertPermission(user, INSPECTION_MATERIAL_PERMISSION_CODES.LIST);
    const where = buildListWhere(query);
    const [items, total] = await Promise.all([
      prisma.qms_inspection_material_requests.findMany({
        where,
        include: materialListInclude,
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.qms_inspection_material_requests.count({ where }),
    ]);
    return { items: items.map((item) => mapListItem(item)), total };
  },

  async approve(
    event: H3Event<EventHandlerRequest>,
    user: UserSession,
    id: string,
    input: InspectionMaterialRequestApproveInput,
  ) {
    await assertPermission(user, INSPECTION_MATERIAL_PERMISSION_CODES.APPROVE);
    const reviewedById = await resolveReviewedById(user);
    const request = await approveInTransaction(id, input, reviewedById);
    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      detailsTemplate:
        'Approved material request for inspection task {{requestNo}} as {{partName}}',
      detailsVariables: {
        partName: request.partName,
        requestNo: request.requestNo,
      },
      targetId: id,
      targetType: 'inspection_material_request',
      userId: reviewedById,
    });
    const mapped = mapInspectionRequest(request);
    publishInspectionRequestCreated(mapped);
    void WxSubscribeMessageService.sendPendingDispatchCreated({
      partName: mapped.partName,
      reporter: mapped.reporter,
      requestNo: mapped.requestNo,
      workOrderNumber: mapped.workOrderNumber,
    });
    void notifyTelegramNewRequest(mapped);
    return mapped;
  },

  async reject(
    event: H3Event<EventHandlerRequest>,
    user: UserSession,
    id: string,
    input: InspectionMaterialRequestRejectInput,
  ) {
    await assertPermission(user, INSPECTION_MATERIAL_PERMISSION_CODES.REJECT);
    const reviewedById = await resolveReviewedById(user);
    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.qms_inspection_material_requests.findFirst({
        where: { id, status: 'PENDING' },
        select: {
          inspectionRequest: {
            select: { dispatchTaskId: true, id: true, requestNo: true },
          },
        },
      });
      if (!application) {
        throw new BusinessError(
          'MATERIAL_REQUEST_NOT_PENDING',
          'The material request does not exist or has already been reviewed',
          409,
        );
      }
      const requestUpdate = await tx.qms_inspection_requests.updateMany({
        where: {
          id: application.inspectionRequest.id,
          isDeleted: false,
          status: INSPECTION_REQUEST_STATUS.SUBMITTED,
        },
        data: { status: INSPECTION_REQUEST_STATUS.CANCELLED },
      });
      if (requestUpdate.count === 0) {
        throw new BusinessError(
          'INSPECTION_REQUEST_CHANGED',
          'The linked inspection request cannot be rejected',
          409,
        );
      }
      const updated = await tx.qms_inspection_material_requests.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          reviewedAt: new Date(),
          reviewedById,
          reviewRemark: input.remark,
          status: 'REJECTED',
        },
      });
      if (updated.count === 0) {
        throw new BusinessError(
          'MATERIAL_REQUEST_CHANGED',
          'The material request changed during review',
          409,
        );
      }
      if (application.inspectionRequest.dispatchTaskId) {
        await tx.qms_task_dispatches.updateMany({
          where: { id: application.inspectionRequest.dispatchTaskId },
          data: { status: TASK_DISPATCH_STATUS.CANCELLED },
        });
      }
      return application.inspectionRequest;
    });
    await recordBusinessAuditLog(event, {
      action: 'UPDATE',
      detailsTemplate:
        'Rejected material request for inspection task {{requestNo}}: {{remark}}',
      detailsVariables: {
        remark: input.remark,
        requestNo: result.requestNo,
      },
      targetId: id,
      targetType: 'inspection_material_request',
      userId: reviewedById,
    });
    return { id, status: 'REJECTED' as const };
  },
};
