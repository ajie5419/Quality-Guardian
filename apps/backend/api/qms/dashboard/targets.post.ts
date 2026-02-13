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
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);

    if (!body || typeof body !== 'object') {
      setResponseStatus(event, 400);
      return useResponseError('Invalid request body');
    }

    // Basic validation
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'number' || value < 0 || value > 100) {
        setResponseStatus(event, 400);
        return useResponseError(
          `Invalid value for ${key}: ${value}. Must be between 0 and 100.`,
        );
      }
    }

    const value = JSON.stringify(body);

    await prisma.system_settings.upsert({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
      update: { value, updatedAt: new Date() },
      create: {
        key: 'QMS_PASS_RATE_TARGETS',
        value,
        description: 'QMS各工序目标合格率配置 (Quality Pass Rate Targets)',
      },
    });

    return useResponseSuccess({ success: true, targets: body });
  } catch (error) {
    logApiError('dashboard-targets', error);
    setResponseStatus(event, 500);
    return useResponseError(
      `Failed to save quality targets: ${(error as Error).message}`,
    );
  }
});
