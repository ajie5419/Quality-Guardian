import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { AuthService } from '~/modules/user/auth.service';
import {
  badRequestResponse,
  conflictResponse,
  useResponseSuccess,
} from '~/utils/response';

const registerSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  deptId: z.string().trim().min(1),
});

export default defineEventHandler(async (event) => {
  const parsed = registerSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    return badRequestResponse(
      event,
      '用户名、密码和部门均为必填项',
      'BadRequest',
    );
  }
  const result = await AuthService.registerUser({
    deptId: parsed.data.deptId,
    password: parsed.data.password,
    username: parsed.data.username,
  });
  if ('error' in result && result.error === 'DEPT_NOT_FOUND') {
    return badRequestResponse(event, '所选部门不存在', 'BadRequest');
  }
  if ('error' in result && result.error === 'USER_EXISTS') {
    return conflictResponse(event, '用户名已存在', 'Conflict');
  }
  return useResponseSuccess(result);
});
