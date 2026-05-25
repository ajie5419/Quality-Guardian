import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

const schema = z.object({
  component: z.string().optional(),
  icon: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  orderNo: z.number().optional(),
  path: z.string().optional(),
  status: z.number().optional(),
  title: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const id = getRequiredRouterParam(event, 'id', '缺少菜单ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await RbacService.updateMenu(id, schema.parse(await readBody(event)));
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('menu-update', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '菜单不存在');
    }
    return internalServerErrorResponse(event, '更新菜单失败');
  }
});
