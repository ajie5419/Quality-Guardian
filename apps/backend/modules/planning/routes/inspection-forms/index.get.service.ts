import type { H3Event } from 'h3';

import { resolveCanonicalProcessName } from '~/governance/master-data/process-resolver';
import {
  buildInspectionFormProcessFilter,
  resolveInspectionFormProcess,
} from '~/modules/inspection/inspection-form';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

export async function inspection_forms_index_get(event: H3Event) {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  const processName = String(query.processName || '').trim();
  const partName = String(query.partName || '').trim();

  try {
    const processWhere = await buildInspectionFormProcessFilter({
      category: 'PROCESS',
      processName,
    });
    const list = await prisma.inspection_form_templates.findMany({
      where: {
        isDeleted: false,
        ...(workOrderNumber ? { workOrderNumber } : {}),
        ...processWhere,
        ...(partName
          ? {
              partName: {
                contains: partName,
              },
            }
          : {}),
      },
      include: {
        process: {
          select: {
            name: true,
          },
        },
        work_order: {
          select: {
            customerName: true,
            projectName: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return useListResponseSuccess(
      list.map((item) => ({
        attachments: item.attachments,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        customerName: item.work_order?.customerName || '',
        drawingNo: item.drawingNo || '',
        formFields: item.formFields,
        formName: item.formName,
        formNo: item.formNo || '',
        id: item.id,
        partName: String(item.partName || ''),
        processName:
          resolveCanonicalProcessName(item) ||
          resolveInspectionFormProcess(item),
        projectName: item.projectName || item.work_order?.projectName || '',
        status: item.status,
        templateQuantity: item.templateQuantity ?? null,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
        workOrderNumber: item.workOrderNumber,
      })),
    );
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return useListResponseSuccess([]);
    }
    logApiError('inspection-form-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取检验表列表失败');
  }
}
