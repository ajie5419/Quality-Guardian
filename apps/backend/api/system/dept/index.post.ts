import { defineEventHandler, readBody } from 'h3';
import { DeptService } from '~/modules/dept';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/db-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { normalizeCreateDeptBody } from './dept-body';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = normalizeCreateDeptBody(await readBody(event));
    const newDept = await DeptService.create(body);
    return useResponseSuccess(newDept);
  } catch (error) {
    logApiError('dept', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '部门名称已存在');
    }
    return internalServerErrorResponse(event, '创建部门失败');
  }
});
