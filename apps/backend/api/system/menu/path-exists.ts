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
    const path = body.path;

    if (!path) {
      setResponseStatus(event, 400);
      return useResponseError('path is required');
    }

    const exists = await prisma.menus.findFirst({
      where: {
        path,
        isDeleted: false,
      },
    });

    return useResponseSuccess(!!exists);
  } catch (error) {
    logApiError('menu-path-exists', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to validate menu path');
  }
});
