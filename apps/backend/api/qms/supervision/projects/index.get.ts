import { defineEventHandler, getQuery } from 'h3';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event) as Record<string, unknown>;
  try {
    const data = await SupervisionService.listProjects({
      keyword: query.keyword ? String(query.keyword) : undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      status: query.status ? (String(query.status) as any) : undefined,
      supplierName: query.supplierName ? String(query.supplierName) : undefined,
    });
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-projects-list', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch supervision projects',
    );
  }
});
