import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  const body = await readBody(event);

  await prisma.system_settings.upsert({
    where: { key: 'AI_CONFIGURATION' },
    update: {
      value: JSON.stringify(body),
      updatedAt: new Date(),
    },
    create: {
      key: 'AI_CONFIGURATION',
      value: JSON.stringify(body),
      updatedAt: new Date(),
    },
  });

  return useResponseSuccess(body);
});
