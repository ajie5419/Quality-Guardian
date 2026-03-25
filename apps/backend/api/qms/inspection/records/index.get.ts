import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { parseInspectionRecordListQuery } from '~/utils/inspection-record';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const { items, total } = await InspectionService.findAll(
      parseInspectionRecordListQuery(query),
    );
    return useResponseSuccess({ items, total });
  } catch (error: unknown) {
    logApiError('inspection-list', error);
    if (isPrismaSchemaMismatchError(error)) {
      return badRequestResponse(
        event,
        '数据库结构未同步，请先执行 pnpm --dir apps/backend run db:push',
      );
    }
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection records',
    );
  }
});
