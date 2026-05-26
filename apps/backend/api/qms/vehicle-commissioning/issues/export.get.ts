import { ISSUE_TRACKING_STATUS } from '@qgs/shared';
import { setHeader } from 'h3';
import { z } from 'zod';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { internalServerErrorResponse } from '~/utils/response';

const querySchema = z.object({
  date: z.string().optional(),
  projectName: z.string().optional(),
  status: z
    .enum([
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ])
    .optional(),
  workOrderNumber: z.string().optional(),
});

export default defineValidatedHandler(querySchema, async (event, query) => {
  try {
    const buffer = await VehicleCommissioningService.exportIssuesWorkbook({
      date: query.date,
      page: 1,
      pageSize: 20_000,
      projectName: query.projectName,
      status: query.status,
      workOrderNumber: query.workOrderNumber,
    });
    setHeader(
      event,
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    setHeader(
      event,
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('调试验收问题台账.xlsx')}`,
    );
    return buffer;
  } catch (error) {
    logApiError('vehicle-commissioning-issues-export', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to export issues');
  }
});
