import type { H3Event } from 'h3';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { buildInspectionFormProcessFilter } from '~/modules/inspection/inspection-form';
import { logApiError } from '~/utils/api-logger';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { resolveProcessIdForWrite } from '~/utils/process-resolver';
import { getMissingRequiredFields } from '~/utils/request-validation';

export async function inspection_forms_index_post(event: H3Event) {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const workOrderNumber = String(body.workOrderNumber || '').trim();
    const processName = String(body.processName || '').trim();
    const partName = String(body.partName || '').trim();
    const formName = String(body.formName || '').trim();
    const formNo = String(body.formNo || '').trim();
    const drawingNo = String(body.drawingNo || '').trim();
    const templateQuantity = Number(body.templateQuantity);

    const missingFields = getMissingRequiredFields(
      { formName, processName, workOrderNumber },
      ['workOrderNumber', 'processName', 'formName'],
    );
    if (missingFields.length > 0) {
      return badRequestResponse(event, '工单号、工序、检验表名称不能为空');
    }
    const status = String(body.status || 'active').trim() || 'active';
    const processId = await resolveProcessIdForWrite({
      processName,
    });
    const governedFields = buildGovernedWriteFieldsForTable(
      'inspection_form_templates',
      {
        formName,
        partName,
        processName,
        projectName: body.projectName,
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
        ? formName
        : governedFields.formName;
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'inspection_form_templates',
      {
        formName: governedFormName,
      },
    );
    const processFilter = await buildInspectionFormProcessFilter({
      category: 'PROCESS',
      processName,
    });
    if (status === 'active') {
      const duplicatedActiveTemplate =
        // governance-allow-direct-canonical-read: duplicate-template guard keeps part-name matching semantics.
        await prisma.inspection_form_templates.findFirst({
          where: {
            isDeleted: false,
            ...(partName
              ? { partName }
              : { OR: [{ partName: null }, { partName: '' }] }),
            ...processFilter,
            status: 'active',
            workOrderNumber,
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

    const created = await prisma.inspection_form_templates.create({
      data: {
        attachments:
          body.attachments === undefined
            ? null
            : String(body.attachments || '').trim() || null,
        createdBy: userinfo.username,
        formFields:
          body.formFields === undefined
            ? null
            : JSON.stringify(body.formFields || []),
        formName: governedFormName,
        formNo: formNo || null,
        partName: governedPartName ?? null,
        processId,
        processName: governedProcessName || '',
        projectName: governedProjectName ?? null,
        ...governedCanonicalIds,
        templateQuantity:
          Number.isFinite(templateQuantity) && templateQuantity > 0
            ? Math.trunc(templateQuantity)
            : null,
        drawingNo: drawingNo || null,
        status,
        updatedBy: userinfo.username,
        workOrderNumber,
      },
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: body.attachments,
      bizId: created.id,
      bizType: 'inspection_form_template',
    });
    return useResponseSuccess(created);
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-create', error, undefined, event);
    return internalServerErrorResponse(event, '创建检验表失败');
  }
}
