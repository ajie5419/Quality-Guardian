import { z } from 'zod';
import { UserService } from '~/modules/user/user.service';
import { logApiError } from '~/utils/api-logger';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { usePageResponseSuccess, useResponseError } from '~/utils/response';

const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  roleName: z.string().trim().min(1).optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

export default defineValidatedHandler(
  userListQuerySchema,
  async (event, query) => {
    try {
      const result = await UserService.findAll({
        page: query.page,
        pageSize: query.pageSize,
        roleName: query.roleName,
        status: query.status,
      });

      return usePageResponseSuccess(query.page, query.pageSize, result.items, {
        total: result.total,
      });
    } catch (error) {
      logApiError('user', error, undefined, event);
      setResponseStatus(event, 500);
      return useResponseError('Failed to fetch user list');
    }
  },
);
