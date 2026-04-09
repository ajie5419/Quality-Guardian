import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaSchemaMismatchError,
} from '~/utils/prisma-error';
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

    if (finalStatus === 'active') {
      const finalWorkOrderNumber = workOrderNumber ?? current?.workOrderNumber;
      const finalProcessName = processName ?? current?.processName;
      const finalPartName = partName ?? String(current?.partName || '').trim();
      if (finalWorkOrderNumber && finalProcessName) {
        const duplicatedActiveTemplate =
          await prisma.inspection_form_templates.findFirst({
            where: {
              id: { not: id },
              isDeleted: false,
              ...(finalPartName
                ? { partName: finalPartName }
                : { OR: [{ partName: null }, { partName: '' }] }),
              processName: finalProcessName,
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

    let normalizedTemplateQuantity: null | number | undefined;
    if (templateQuantity === undefined) {
      normalizedTemplateQuantity = undefined;
    } else if (Number.isFinite(templateQuantity) && templateQuantity > 0) {
      normalizedTemplateQuantity = Math.trunc(templateQuantity);
    } else {
      normalizedTemplateQuantity = null;
    }

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
        formName:
          body.formName === undefined
            ? undefined
            : String(body.formName || '').trim(),
        formNo: formNo === undefined ? undefined : formNo || null,
        partName: partName === undefined ? undefined : partName || null,
        processName: processName === undefined ? undefined : processName,
        projectName:
          body.projectName === undefined
            ? undefined
            : String(body.projectName || '').trim() || null,
        templateQuantity: normalizedTemplateQuantity,
        drawingNo: drawingNo === undefined ? undefined : drawingNo || null,
        status: status === undefined ? undefined : status,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
        workOrderNumber:
          workOrderNumber === undefined ? undefined : workOrderNumber,
      },
    });
    return useResponseSuccess(updated);
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库缺少检验表模块表，请先执行 db push',
      );
    }
    logApiError('inspection-form-update', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '检验表不存在');
    }
    return internalServerErrorResponse(event, '更新检验表失败');
  }
});
