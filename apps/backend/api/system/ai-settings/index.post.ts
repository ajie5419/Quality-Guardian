import { defineEventHandler, readBody } from 'h3';
import { SystemService } from '~/modules/system/system.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const body = await readBody(event);

  await SystemService.saveAiSettings(body);

  return useResponseSuccess(body);
});
