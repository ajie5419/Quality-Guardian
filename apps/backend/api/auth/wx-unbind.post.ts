import { defineEventHandler } from 'h3';
import { WxAuthService } from '~/modules/user/wx-auth.service';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userId = String(event.context.user?.userId ?? '');
  if (!userId) {
    return useResponseError('未登录');
  }

  await WxAuthService.wxUnbind(userId);
  return useResponseSuccess(null);
});
