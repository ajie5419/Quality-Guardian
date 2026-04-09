import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
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
    if (status === 'active') {
      const duplicatedActiveTemplate =
        await prisma.inspection_form_templates.findFirst({
          where: {
            isDeleted: false,
            ...(partName
              ? { partName }
              : { OR: [{ partName: null }, { partName: '' }] }),
            processName,
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
        formName,
        formNo: formNo || null,
        partName: partName || null,
        processName,
        projectName: String(body.projectName || '').trim() || null,
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
    return useResponseSuccess(created);
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-create', error);
    return internalServerErrorResponse(event, '创建检验表失败');
  }
});
