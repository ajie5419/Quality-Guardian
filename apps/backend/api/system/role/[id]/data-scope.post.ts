import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
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
    logApiError('role-data-scope-save', error);
    return internalServerErrorResponse(event, '保存数据权限策略失败');
  }
});
