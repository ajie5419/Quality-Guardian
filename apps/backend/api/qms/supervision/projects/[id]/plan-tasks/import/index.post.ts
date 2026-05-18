import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const projectId = getRouterParam(event, 'id');
  if (!projectId) return badRequestResponse(event, '监造项目不能为空');

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    if (!String(body.fileUrl || '').trim()) {
      return badRequestResponse(event, '计划文件不能为空');
    }
    const data = await SupervisionService.importPlanTasks(projectId, body);
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: [String(body.fileUrl)],
        bizId: projectId,
        bizType: 'supervision_plan_task',
        fieldName: 'source_file',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-plan-tasks-import', error);
    return internalServerErrorResponse(
      event,
      error instanceof Error
        ? error.message
        : 'Failed to import supervision plan tasks',
    );
  }
});
