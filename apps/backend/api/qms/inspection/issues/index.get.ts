import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const year = query.year ? Number.parseInt(String(query.year)) : undefined;
  const projectName = query.projectName ? String(query.projectName) : undefined;
  const status = query.status;
  const severity = query.severity;
  const defectType = query.defectType;
  const processName = query.processName ? String(query.processName) : undefined;
  const supplierName = query.supplierName
    ? String(query.supplierName)
    : undefined;
  const workOrderNumber = query.workOrderNumber
    ? String(query.workOrderNumber)
    : undefined;
  const page = query.page ? Number.parseInt(String(query.page)) : 1;
  const pageSize = query.pageSize
    ? Number.parseInt(String(query.pageSize))
    : 20;
  const sortBy = query.sortBy ? String(query.sortBy) : undefined;
  const sortOrder = query.sortOrder as 'asc' | 'desc' | undefined;

  try {
    const result = await InspectionService.getIssues({
      year,
      projectName,
      status: status as string | string[],
      severity: severity as string | string[],
      defectType: defectType as string | string[],
      processName,
      supplierName,
      workOrderNumber,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('issues', error);
    return useResponseSuccess([]);
  }
});
