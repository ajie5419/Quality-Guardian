import { defineEventHandler, getQuery } from 'h3';
import { WorkOrderService } from '~/services/work-order.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWorkOrderListQuery } from '~/utils/work-order';
import { parseRequirementAttachments } from '~/utils/work-order-requirement-attachments';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event) as Record<string, unknown>;
  const params = parseWorkOrderListQuery(query);
  const filter = normalizeFilter(query.filter);

  try {
    const result = await WorkOrderService.getRequirementBoard({
      ...params,
      filter,
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });

    return useResponseSuccess({
      items: result.items.map((item) => ({
        attachments: parseRequirementAttachments(item.attachment),
        confirmedAt: item.confirmedAt,
        confirmer: item.confirmer || '',
        confirmStatus: String(item.confirmStatus || 'PENDING').toUpperCase(),
        createdAt: item.createdAt,
        customerName: item.work_order?.customerName || '',
        division: item.work_order?.division || '',
        id: item.id,
        partName: item.partName || '',
        processName: item.processName || '',
        projectName: item.work_order?.projectName || '',
        requirementName: item.requirementName || '',
        responsiblePerson: item.responsiblePerson || '',
        responsibleTeam: item.responsibleTeam || '',
        workOrderNumber: item.workOrderNumber,
        workOrderStatus: item.work_order?.status || '',
      })),
      total: result.total,
    });
  } catch (error) {
    logApiError('work-order-requirement-board', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch requirement board',
    );
  }
});

function normalizeFilter(value: unknown) {
  const normalized = String(value || 'all')
    .trim()
    .toLowerCase();
  if (normalized === 'confirmed') return 'confirmed' as const;
  if (normalized === 'pending') return 'pending' as const;
  if (normalized === 'overdue') return 'overdue' as const;
  return 'all' as const;
}
