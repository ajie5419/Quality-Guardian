import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/modules/rbac/rbac.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', '缺少角色ID');
  if (typeof id !== 'string') {
    return id;
  }

  const body = await readBody(event);
  const module = String(body?.module || '').trim();
  const scopeType = String(body?.scopeType || 'SELF')
    .trim()
    .toUpperCase();
  const deptIds = Array.isArray(body?.deptIds) ? body.deptIds : [];

  if (!module) {
    return badRequestResponse(event, 'module 不能为空');
  }
  if (!['ALL', 'DEPT', 'SELF'].includes(scopeType)) {
    return badRequestResponse(event, 'scopeType 仅支持 ALL/DEPT/SELF');
  }

  try {
    await RbacService.saveRoleDataScope(
      id,
      module,
      scopeType as 'ALL' | 'DEPT' | 'SELF',
      deptIds,
    );
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('role-data-scope-save', error, undefined, event);
    return internalServerErrorResponse(event, '保存数据权限策略失败');
  }
});
