import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({ keyword: z.string().optional() }).passthrough();

export default defineEventHandler(async (event) => {
  const query = schema.parse(getQuery(event));
  const keyword = String(query.keyword || '').trim();

  try {
    return useResponseSuccess(
      await InspectionPublicQueryService.getPublicTeams(keyword),
    );
  } catch (error) {
    logApiError('public-inspection-request-team-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取班组列表失败');
  }
});
