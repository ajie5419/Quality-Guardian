import {
  inspectionRecordListQuerySchema,
  parseInspectionRecordListQuery,
} from '~/modules/inspection/inspection-record';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { defineValidatedHandler } from '~/utils/define-validated-handler';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineValidatedHandler(
  inspectionRecordListQuerySchema,
  async (event, query) => {
    try {
      const userinfo = getCurrentUser(event);
      const scope = event.context.dataScope as
        | undefined
        | { deptIds: string[]; scopeType: 'ALL' | 'DEPT' | 'SELF' };
      const { items, total } = await InspectionService.findAll(
        parseInspectionRecordListQuery(query),
        scope && userinfo
          ? { scope, user: { id: userinfo.id, username: userinfo.username } }
          : undefined,
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
