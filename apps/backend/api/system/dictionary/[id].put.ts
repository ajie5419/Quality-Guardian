import { defineEventHandler } from 'h3';
import upstreamHandler from '~/modules/dictionary/dictionary-id.put.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { getCurrentUser } from '~/utils/current-user';

export default defineEventHandler(async (event) => {
  const adminCheck = requireSystemAdmin(event, getCurrentUser(event));
  if (adminCheck) return adminCheck;
  return upstreamHandler(event);
});
