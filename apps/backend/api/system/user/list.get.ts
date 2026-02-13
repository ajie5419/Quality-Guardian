import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { UserService } from '~/services/user.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
  useResponseError,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
    logApiError('user', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch user list');
  }
});
