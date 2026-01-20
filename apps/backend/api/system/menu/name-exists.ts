import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return useResponseSuccess(true); // Fail safe
  }

  try {
    const body = await readBody(event);
    const name = body.name; // Expecting { name: 'xxx' }

    if (!name) return useResponseSuccess(false);

    const exists = await prisma.menus.findFirst({
      where: {
        name,
        isDeleted: false,
      },
    });

    return useResponseSuccess(!!exists);
  } catch {
    return useResponseSuccess(false);
  }
});
