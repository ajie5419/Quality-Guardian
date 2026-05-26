import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { usePageResponseSuccess, useResponseError } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const { page = 1, pageSize = 20 } = getQuery(event);
    const result = await UserService.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
    });

    return usePageResponseSuccess(
      page as string,
      pageSize as string,
      result.items,
      {
        total: result.total,
      },
    );
  } catch (error) {
    logApiError('user', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch user list');
  }
});
