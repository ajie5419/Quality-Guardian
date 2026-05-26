import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const importPlanTasksBodySchema = z
  .object({ fileUrl: z.unknown().optional() })
  .passthrough();

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id');
  if (!projectId) return badRequestResponse(event, '监造项目不能为空');

  try {
    const body = importPlanTasksBodySchema.parse(await readBody(event));
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
    logApiError('supervision-plan-tasks-import', error, undefined, event);
    return internalServerErrorResponse(
      event,
      error instanceof Error
        ? error.message
        : 'Failed to import supervision plan tasks',
    );
  }
});
