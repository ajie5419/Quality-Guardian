import { defineEventHandler, readBody } from 'h3';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/core/master-data/governance-write';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { stringifyRequirementAttachments } from '~/utils/work-order-requirement-attachments';

type RequirementPayload = {
  attachments?: unknown[];
  items?: unknown[];
  partName?: string;
  processName?: string;
  requirementName?: string;
  responsiblePerson?: string;
  responsibleTeam?: string;
  workOrderNumber?: string;
};

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = (await readBody(event)) as RequirementPayload & {
      requirements?: RequirementPayload[];
    };
    const requirements = Array.isArray(body.requirements)
      ? body.requirements
      : [body];

    if (requirements.length === 0) {
      return badRequestResponse(event, '至少上传一条要求');
    }

    const normalized = requirements.map((item) => ({
      attachments: stringifyRequirementAttachments(item.attachments),
      items: Array.isArray(item.items) ? item.items : [],
      partName: String(item.partName || '').trim() || null,
      processName: String(item.processName || '').trim() || null,
      requirementName: String(item.requirementName || '').trim(),
      responsiblePerson: String(item.responsiblePerson || '').trim() || null,
      responsibleTeam: String(item.responsibleTeam || '').trim() || null,
      workOrderNumber: String(item.workOrderNumber || '').trim(),
    }));

    for (const item of normalized) {
      if (!item.workOrderNumber || !item.requirementName) {
        return badRequestResponse(event, '工单号和要求名称不能为空');
      }
    }

    const createPayloads = await Promise.all(
      normalized.map(async (item) => {
        const governedFields = buildGovernedWriteFieldsForTable(
          'work_order_requirements',
          {
            partName: item.partName,
            processName: item.processName,
            requirementName: item.requirementName,
            responsibleTeam: item.responsibleTeam,
          },
        );
        const governedCanonicalIds =
          await buildGovernedCanonicalWritePairForTable(
            'work_order_requirements',
            governedFields as Record<string, unknown>,
          );
        return {
          attachment: item.attachments,
          createdBy: userinfo.username,
          ...governedFields,
          ...governedCanonicalIds,
          requirementItems: JSON.stringify(item.items || []),
          requirementName: item.requirementName,
          responsiblePerson: item.responsiblePerson,
          responsibleTeam: item.responsibleTeam,
          status: 'active',
          updatedBy: userinfo.username,
          workOrderNumber: item.workOrderNumber,
        };
      }),
    );

    const created = await prisma.$transaction(
      createPayloads.map((data) =>
        prisma.work_order_requirements.create({
          data,
          select: {
            id: true,
            requirementName: true,
            workOrderNumber: true,
          },
        }),
      ),
    );

    await Promise.all(
      created.map((item, index) =>
        FileStorageService.registerReferencesFromAttachments({
          attachments: normalized[index]?.attachments,
          bizId: item.id,
          bizType: 'work_order_requirement',
        }),
      ),
    );

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'work_order_requirement',
      targetId: created.map((item) => item.id).join(','),
      detailsTemplate: '新增工单要求: {{count}} 条',
      detailsVariables: {
        count: created.length,
      },
    });

    return useResponseSuccess({
      items: created,
      success: true,
    });
  } catch (error) {
    logApiError('work-order-requirement-create', error, undefined, event);
    return internalServerErrorResponse(event, '上传工单要求失败');
  }
});
