import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isProcessPassRateTargetKey } from '~/utils/pass-rate-process';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);

    if (!body || typeof body !== 'object') {
      return badRequestResponse(event, 'Invalid request body');
    }

    // Basic validation
    for (const [key, value] of Object.entries(body)) {
      if (!isProcessPassRateTargetKey(key)) {
        return badRequestResponse(event, `Unsupported process key: ${key}`);
      }
      if (typeof value !== 'number' || value < 0 || value > 100) {
        return badRequestResponse(
          event,
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
    return internalServerErrorResponse(
      event,
      `Failed to save quality targets: ${(error as Error).message}`,
    );
  }
});
