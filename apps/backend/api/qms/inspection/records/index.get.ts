import { z } from 'zod';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaSchemaMismatchError } from '~/utils/db-error';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { parseInspectionRecordListQuery } from '~/utils/inspection-record';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const inspectionRecordListQuerySchema = z.object({}).passthrough();

export default defineValidatedHandler(
  inspectionRecordListQuerySchema,
  async (event, query) => {
    try {
      const { items, total } = await InspectionService.findAll(
        parseInspectionRecordListQuery(query),
      );
      return useResponseSuccess({ items, total });
    } catch (error: unknown) {
      logApiError('inspection-list', error, undefined, event);
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
  },
);
