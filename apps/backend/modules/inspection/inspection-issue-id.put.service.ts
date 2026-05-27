import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import {
  findInspectionIssueAccessRecord,
  hasInspectionIssueWriteAccess,
} from '~/modules/inspection/inspection-issue';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  const id = getRequiredRouterParam(event, 'id', '缺少ID');
  if (typeof id !== 'string') return id;
  let existingNcNumber: null | string = null;
  try {
    const existingRecord = await findInspectionIssueAccessRecord(id);
    if (!existingRecord) return notFoundResponse(event, '记录不存在');
    existingNcNumber = existingRecord.nonConformanceNumber;
    if (
      !hasInspectionIssueWriteAccess({
        inspector: existingRecord.inspector,
        roles: userinfo.roles,
        username: userinfo.username,
      })
    )
      return forbiddenResponse(event, '无权修改：您只能修改自己创建的数据');
  } catch (error) {
    logApiError('issues', error, undefined, event);
    return internalServerErrorResponse(event, '权限校验失败');
  }

  try {
    const body = schema.parse(await readBody(event));
    await InspectionApiService.updateIssue(
      userinfo,
      id,
      body,
      existingNcNumber,
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('issues', error, undefined, event);
    if (isPrismaNotFoundError(error))
      return notFoundResponse(event, '记录不存在');
    return internalServerErrorResponse(event, '更新问题失败');
  }
});
