import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const MANUAL_SETTING_KEY = 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const month = normalizeMonth(body.month);
    const count = Number(body.count);

    if (!month) {
      return badRequestResponse(event, 'Invalid month');
    }

    if (!Number.isInteger(count) || count < 0) {
      return badRequestResponse(event, 'Invalid count');
    }

    const current = await getManualData();
    const next = {
      ...current,
      [month]: count,
    };

    await prisma.system_settings.upsert({
      where: { key: MANUAL_SETTING_KEY },
      update: {
        description: `车辆产品售后反馈去年手动数据，最近更新人：${userinfo.username}`,
        updatedAt: new Date(),
        value: JSON.stringify(next),
      },
      create: {
        description: `车辆产品售后反馈去年手动数据，最近更新人：${userinfo.username}`,
        key: MANUAL_SETTING_KEY,
        value: JSON.stringify(next),
      },
    });

    return useResponseSuccess({
      count,
      month,
      success: true,
      updatedBy: userinfo.username,
    });
  } catch (error) {
    logApiError('vehicle-failure-rate-manual', error);
    return internalServerErrorResponse(
      event,
      `Failed to save manual vehicle feedback data: ${(error as Error).message}`,
    );
  }
});

async function getManualData(): Promise<Record<string, number>> {
  const setting = await prisma.system_settings.findUnique({
    where: { key: MANUAL_SETTING_KEY },
  });

  if (!setting?.value) {
    return {};
  }

  try {
    const parsed = JSON.parse(setting.value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([month, count]) => [month, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count)),
    );
  } catch {
    return {};
  }
}

function normalizeMonth(value: unknown): null | string {
  if (typeof value !== 'string') {
    return null;
  }

  const month = value.trim();
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) ? month : null;
}
