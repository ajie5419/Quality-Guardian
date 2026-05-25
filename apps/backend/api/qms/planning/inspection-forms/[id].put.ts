import { defineEventHandler, readBody } from 'h3';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/core/master-data/governance-write';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { buildInspectionFormProcessFilter } from '~/utils/inspection-form';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaSchemaMismatchError,
} from '~/utils/prisma-error';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const current = await prisma.inspection_form_templates.findUnique({
      where: { id },
      select: {
        partName: true,
        processId: true,
        process: {
          select: {
            name: true,
          },
        },
        processName: true,
        status: true,
        workOrderNumber: true,
      },
    });
    if (!current) {
      return notFoundResponse(event, '检验表不存在');
    }

    const workOrderNumber =
      body.workOrderNumber === undefined
        ? undefined
        : String(body.workOrderNumber || '').trim();
    const processName =
      body.processName === undefined
        ? undefined
        : String(body.processName || '').trim();
    const partName =
      body.partName === undefined
        ? undefined
        : String(body.partName || '').trim();
    const status =
      body.status === undefined
        ? undefined
        : String(body.status || '').trim() || 'active';
    const formNo =
      body.formNo === undefined ? undefined : String(body.formNo || '').trim();
    const drawingNo =
      body.drawingNo === undefined
        ? undefined
        : String(body.drawingNo || '').trim();
    const templateQuantity =
      body.templateQuantity === undefined
        ? undefined
        : Number(body.templateQuantity);
    const finalStatus = status ?? String(current.status || '').trim();
    const currentProcessName = resolveCanonicalProcessName(current) || '';

    if (finalStatus === 'active') {
      const finalWorkOrderNumber = workOrderNumber ?? current?.workOrderNumber;
      const finalProcessName = processName ?? currentProcessName;
      const finalPartName = partName ?? String(current?.partName || '').trim();
      if (finalWorkOrderNumber && finalProcessName) {
        const processFilter = await buildInspectionFormProcessFilter({
          category: 'PROCESS',
          processId: processName === undefined ? current.processId : null,
          processName: finalProcessName,
        });
        const duplicatedActiveTemplate =
          await prisma.inspection_form_templates.findFirst({
            where: {
              id: { not: id },
              isDeleted: false,
              ...(finalPartName
                ? { partName: finalPartName }
                : { OR: [{ partName: null }, { partName: '' }] }),
              ...processFilter,
              status: 'active',
              workOrderNumber: finalWorkOrderNumber,
            },
            select: { id: true },
          });
        if (duplicatedActiveTemplate) {
          return conflictResponse(
            event,
            '同一工单同一工序已存在启用中的检验表模板，请先停用旧模板',
          );
        }
      }
    }
    const processNameChanged =
      processName !== undefined && processName !== currentProcessName;

    let normalizedTemplateQuantity: null | number | undefined;
    if (templateQuantity === undefined) {
      normalizedTemplateQuantity = undefined;
    } else if (Number.isFinite(templateQuantity) && templateQuantity > 0) {
      normalizedTemplateQuantity = Math.trunc(templateQuantity);
    } else {
      normalizedTemplateQuantity = null;
    }
    let resolvedProcessId: null | string | undefined;
    if (processName === undefined) {
      resolvedProcessId = undefined;
    } else if (processNameChanged) {
      resolvedProcessId = await resolveProcessIdForWrite({
        processName,
      });
    } else {
      resolvedProcessId = undefined;
    }
    const governedFields = buildGovernedWriteFieldsForTable(
      'inspection_form_templates',
      {
        formName:
          body.formName === undefined
            ? undefined
            : String(body.formName || '').trim(),
        partName: partName === undefined ? undefined : partName || null,
        processName: processName === undefined ? undefined : processName,
        projectName:
          body.projectName === undefined
            ? undefined
            : String(body.projectName || '').trim() || null,
      },
    );
    const governedPartName =
      governedFields.partName === undefined
        ? undefined
        : governedFields.partName;
    const governedProcessName =
      governedFields.processName === undefined
        ? undefined
        : governedFields.processName;
    const governedProjectName =
      governedFields.projectName === undefined
        ? undefined
        : governedFields.projectName;
    const governedFormName =
      governedFields.formName === undefined
        ? undefined
        : governedFields.formName;
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'inspection_form_templates',
      {
        formName: governedFormName,
      },
    );

    const updated = await prisma.inspection_form_templates.update({
      where: { id },
      data: {
        attachments:
          body.attachments === undefined
            ? undefined
            : String(body.attachments || '').trim() || null,
        formFields:
          body.formFields === undefined
            ? undefined
            : JSON.stringify(body.formFields || []),
        formName: governedFormName,
        formNo: formNo === undefined ? undefined : formNo || null,
        processId: resolvedProcessId,
        partName: governedPartName,
        processName: governedProcessName,
        projectName: governedProjectName,
        ...governedCanonicalIds,
        templateQuantity: normalizedTemplateQuantity,
        drawingNo: drawingNo === undefined ? undefined : drawingNo || null,
        status: status === undefined ? undefined : status,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
        workOrderNumber:
          workOrderNumber === undefined ? undefined : workOrderNumber,
      },
    });
    if (body.attachments !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.attachments,
        bizId: id,
        bizType: 'inspection_form_template',
      });
    }
    return useResponseSuccess(updated);
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-update', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '检验表不存在');
    }
    return internalServerErrorResponse(event, '更新检验表失败');
  }
});
