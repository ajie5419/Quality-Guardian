import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { usePageResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const { page = 1, pageSize = 20 } = getQuery(event);
    const currentPage = Number(page);
    const currentPageSize = Number(pageSize);
    const { items, total } = await RbacService.listRoles(
      currentPage,
      currentPageSize,
    );
    return usePageResponseSuccess(page as string, pageSize as string, items, {
      total,
    });
  } catch (error) {
    logApiError('list', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch role list');
  }
});
