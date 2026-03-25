import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '~/utils/inspection-form';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  const processName = String(query.processName || '').trim();
  const partName = String(query.partName || '').trim();
  const processCandidates = resolveInspectionFormProcessCandidates({
    category: 'PROCESS',
    processName,
  });

  try {
    const list = await prisma.inspection_form_templates.findMany({
      where: {
        isDeleted: false,
        ...(workOrderNumber ? { workOrderNumber } : {}),
        ...(processName
          ? {
              processName: {
                in:
                  processCandidates.length > 0
                    ? processCandidates
                    : [processName],
              },
            }
          : {}),
        ...(partName
          ? {
              partName: {
                contains: partName,
              },
            }
          : {}),
      },
      include: {
        work_order: {
          select: {
            customerName: true,
            projectName: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return useResponseSuccess(
      list.map((item) => ({
        attachments: item.attachments,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        customerName: item.work_order?.customerName || '',
        formFields: item.formFields,
        formName: item.formName,
        id: item.id,
        partName: String(item.partName || ''),
        processName: resolveInspectionFormProcess(item),
        projectName: item.projectName || item.work_order?.projectName || '',
        status: item.status,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
        workOrderNumber: item.workOrderNumber,
      })),
    );
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return useResponseSuccess([]);
    }
    logApiError('inspection-form-list', error);
    return internalServerErrorResponse(event, '获取检验表列表失败');
  }
});
