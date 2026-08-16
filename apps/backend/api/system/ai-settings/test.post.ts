import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/system/ai-settings-test.post.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { getCurrentUser } from '~/utils/current-user';

export default defineEventHandler(async (event) => {
  const adminCheck = requireSystemAdmin(event, getCurrentUser(event));
  if (adminCheck) return adminCheck;
  return upstreamHandler(event);
});
