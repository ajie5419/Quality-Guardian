import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { RbacService } from '~/modules/rbac/rbac.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({
  name: z.string().trim().min(1),
  pid: z.any().optional(),
  path: z.string().optional(),
  component: z.string().optional(),
  type: z.string().optional(),
  orderNo: z.number().optional(),
  status: z.number().optional(),
  title: z.string().optional(),
  icon: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const payload = schema.parse(await readBody(event));
    return useResponseSuccess(
      await RbacService.createMenu({ ...payload, name: payload.name }),
    );
  } catch (error) {
    logApiError('menu', error, undefined, event);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '菜单名称或路径已存在');
    }
    return internalServerErrorResponse(event, '创建菜单失败');
  }
});
