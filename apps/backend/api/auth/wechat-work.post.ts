import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { UserService } from '~/modules/user';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  forbiddenResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({
  code: z.string().trim().min(1),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    return badRequestResponse(event, '企微授权 code 不能为空', 'BadRequest');
  }

  try {
    const wechatWorkId = await UserService.getWechatWorkUserId(
      parsed.data.code,
    );
    const user = await UserService.findByWechatWorkId(wechatWorkId);
    if (!user) return forbiddenResponse(event, '未绑定企微账号');

    return useResponseSuccess({
      token: UserService.generateToken(user),
      user: {
        id: user.id,
        realName: user.realName || user.username,
        role: user.roles?.name || 'user',
      },
    });
  } catch (error) {
    logApiError('auth.wechat-work', error, undefined, event);
    return forbiddenResponse(event, '企微登录失败');
  }
});
