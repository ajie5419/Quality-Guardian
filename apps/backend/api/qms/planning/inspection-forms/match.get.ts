import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  parseInspectionFormFields,
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '~/utils/inspection-form';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) {
    return badRequestResponse(event, '工单号不能为空');
  }

  const processName = resolveInspectionFormProcess({
    category: String(query.category || ''),
    incomingType: String(query.incomingType || ''),
    processName: String(query.processName || ''),
  });
  const processCandidates = resolveInspectionFormProcessCandidates({
    category: String(query.category || ''),
    incomingType: String(query.incomingType || ''),
    processName: String(query.processName || ''),
  });
  const partName = String(query.partName || '').trim();

  if (!processName) {
    return useResponseSuccess({
      hasTemplate: false,
      processName: '',
      template: null,
    });
  }

  try {
    let template = null;
    if (partName) {
      template = await prisma.inspection_form_templates.findFirst({
        where: {
          isDeleted: false,
          partName,
          processName: {
            in: processCandidates,
          },
          status: 'active',
          workOrderNumber,
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    }
    if (!template) {
      template = await prisma.inspection_form_templates.findFirst({
        where: {
          isDeleted: false,
          OR: [{ partName: null }, { partName: '' }],
          processName: {
            in: processCandidates,
          },
          status: 'active',
          workOrderNumber,
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    }

    if (!template) {
      return useResponseSuccess({
        hasTemplate: false,
        processName,
        template: null,
      });
    }

    return useResponseSuccess({
      hasTemplate: true,
      processName,
      template: {
        attachments: template.attachments || '',
        drawingNo: String(template.drawingNo || ''),
        formFields: parseInspectionFormFields(template.formFields),
        formName: template.formName,
        formNo: String(template.formNo || ''),
        id: template.id,
        partName: String(template.partName || ''),
        templateQuantity: template.templateQuantity ?? null,
        workOrderNumber: template.workOrderNumber,
      },
    });
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return useResponseSuccess({
        hasTemplate: false,
        processName,
        template: null,
      });
    }
    logApiError('inspection-form-match', error);
    return internalServerErrorResponse(event, '匹配检验表失败');
  }
});
