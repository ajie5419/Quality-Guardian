import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { VehicleCommissioningService } from '~/services/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    return badRequestResponse(event, '无效问题ID');
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const updated = await VehicleCommissioningService.updateIssue(
      id,
      {
        assignee: body.assignee ? String(body.assignee) : undefined,
        date: body.date ? String(body.date) : undefined,
        description: body.description ? String(body.description) : undefined,
        partName: body.partName ? String(body.partName) : undefined,
        projectName: body.projectName ? String(body.projectName) : undefined,
        responsibleDepartment: body.responsibleDepartment
          ? String(body.responsibleDepartment)
          : undefined,
        severity: body.severity ? String(body.severity) : undefined,
        solution: body.solution ? String(body.solution) : undefined,
        status: body.status ? (String(body.status) as any) : undefined,
        workOrderNumber: body.workOrderNumber
          ? String(body.workOrderNumber)
          : undefined,
      },
      String(userinfo.id),
    );
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('vehicle-commissioning-issues-update', error);
    return internalServerErrorResponse(event, 'Failed to update issue');
  }
});
