import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { authorizeWrite } from '~/modules/rbac';
import { SupervisionProjectService } from '~/modules/supervision/supervision-project.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.DELETE);
  const query = getQuery(event);
  const id = String(query.id || '').trim();
  if (!id) return badRequestResponse(event, '项目ID不能为空');

  try {
    await SupervisionProjectService.deleteProject(id);
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('supervision-project-delete', error, undefined, event);
    return internalServerErrorResponse(event, '删除项目失败');
  }
});
