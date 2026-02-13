import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const name = body.name; // Expecting { name: 'xxx' }

    if (!name) {
      setResponseStatus(event, 400);
      return useResponseError('name is required');
    }

    const exists = await prisma.menus.findFirst({
      where: {
        name,
        isDeleted: false,
      },
    });

    return useResponseSuccess(!!exists);
  } catch (error) {
    logApiError('menu-name-exists', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to validate menu name');
  }
});
