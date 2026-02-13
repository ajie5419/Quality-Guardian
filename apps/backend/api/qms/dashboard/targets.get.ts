import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export const DEFAULT_PASS_RATE_TARGETS: Record<string, number> = {
  原材料: 99.8,
  辅材: 99.9,
  外购件: 99.8,
  机加件: 99.9,
  下料: 99.9,
  组对: 99.85,
  焊接: 99.85,
  机加: 99.9,
  涂装: 99.85,
  组装: 99.85,
  装配: 99.85,
  外协: 99.85,
  成品检验: 99.85,
  设计: 99.85,
};

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const setting = await prisma.system_settings.findUnique({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
    });

    let targets = { ...DEFAULT_PASS_RATE_TARGETS };
    if (setting && setting.value) {
      const savedTargets = JSON.parse(setting.value);
      targets = { ...targets, ...savedTargets };
    }

    return useResponseSuccess(targets);
  } catch (error) {
    logApiError('dashboard-targets', error);
    return internalServerErrorResponse(
      event,
      `Failed to fetch quality targets: ${(error as Error).message}`,
    );
  }
});
