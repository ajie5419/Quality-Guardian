import { defineEventHandler, getQuery } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
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

  const query = getQuery(event);
  const module = String(query.module || '').trim();
  if (!module) {
    return useResponseSuccess({
      deptIds: [],
      module: '',
      roleId: id,
      scopeType: 'SELF',
    });
  }

  try {
    const data = await RbacService.getRoleDataScope(id, module);
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('role-data-scope-get', error);
    return internalServerErrorResponse(event, '获取数据权限策略失败');
  }
});
