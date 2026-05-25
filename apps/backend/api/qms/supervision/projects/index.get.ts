import { z } from 'zod';
import { defineValidatedHandler } from '~/core/validation/define-validated-handler';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const supervisionProjectsQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  supervisionProjectsQuerySchema,
  async (event, query) => {
    const userinfo = verifyAccessToken(event);
    if (!userinfo) return unAuthorizedResponse(event);

    try {
      const data = await SupervisionService.listProjects({
        keyword: query.keyword ? String(query.keyword) : undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        status: query.status ? String(query.status) : undefined,
        supplierName: query.supplierName
          ? String(query.supplierName)
          : undefined,
      });
      return useResponseSuccess(data);
    } catch (error) {
      logApiError('supervision-projects-list', error, undefined, event);
      return internalServerErrorResponse(
        event,
        'Failed to fetch supervision projects',
      );
    }
  },
);
