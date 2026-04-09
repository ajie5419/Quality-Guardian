import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  buildCanonicalProcessPassRateTargets,
  PROCESS_PASS_RATE_TARGET_ORDER,
} from '~/utils/pass-rate-process';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const setting = await prisma.system_settings.findUnique({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
    });

    const savedTargets = setting?.value ? JSON.parse(setting.value) : {};
    const canonicalTargets = buildCanonicalProcessPassRateTargets(savedTargets);
    const orderedTargets = Object.fromEntries(
      PROCESS_PASS_RATE_TARGET_ORDER.map((key) => [key, canonicalTargets[key]]),
    );

    return useResponseSuccess(orderedTargets);
  } catch (error) {
    logApiError('dashboard-targets', error);
    return internalServerErrorResponse(
      event,
      `Failed to fetch quality targets: ${(error as Error).message}`,
    );
  }
});
