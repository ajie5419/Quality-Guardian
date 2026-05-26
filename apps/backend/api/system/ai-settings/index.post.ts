import { defineEventHandler, readBody } from 'h3';
import { SystemService } from '~/modules/system/system.service';
import { getCurrentUser } from '~/utils/current-user';
import { useResponseSuccess } from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

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
