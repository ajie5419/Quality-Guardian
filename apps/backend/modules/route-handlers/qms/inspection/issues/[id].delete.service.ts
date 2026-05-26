import { defineEventHandler } from 'h3';
import {
  findInspectionIssueAccessRecord,
  hasInspectionIssueWriteAccess,
} from '~/modules/inspection/inspection-issue';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') {
    return id;
  }

  // Data Ownership Check
  try {
    const existingRecord = await findInspectionIssueAccessRecord(id);

    if (!existingRecord) {
      return notFoundResponse(event, '记录不存在');
    }

    if (
      !hasInspectionIssueWriteAccess({
        inspector: existingRecord.inspector,
        roles: userinfo.roles,
        username: userinfo.username,
      })
    ) {
      return forbiddenResponse(event, '无权删除：您只能删除自己创建的数据');
    }
  } catch (error: unknown) {
    logApiError('issues', error, undefined, event);
    return internalServerErrorResponse(event, '权限校验失败');
  }

  try {
    await InspectionService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error, undefined, event);
    return internalServerErrorResponse(event, '删除问题失败');
  }
});
