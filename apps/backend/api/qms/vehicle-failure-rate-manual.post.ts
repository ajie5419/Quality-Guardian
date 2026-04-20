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
const MANUAL_WARRANTY_SETTING_KEY =
  'QMS_VEHICLE_FAILURE_LAST_YEAR_WARRANTY_MONTHLY_MANUAL';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
    const month = normalizeMonth(body.month);
    if (!month) {
      return badRequestResponse(event, 'Invalid month');
    }

    const hasCount = body.count !== undefined;
    const hasWarranty = body.warrantyVehicleCount !== undefined;
    if (!hasCount && !hasWarranty) {
      return badRequestResponse(event, 'Invalid payload');
    }

    const responsePayload: Record<string, unknown> = {
      month,
      success: true,
      updatedBy: userinfo.username,
    };

    if (hasCount) {
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 0) {
        return badRequestResponse(event, 'Invalid count');
      }

      const current = await getManualData(MANUAL_SETTING_KEY);
      const next = {
        ...current,
        [month]: count,
      };
      await saveManualData(
        MANUAL_SETTING_KEY,
        next,
        `车辆产品售后反馈去年手动数据，最近更新人：${userinfo.username}`,
      );
      responsePayload.count = count;
    }

    if (hasWarranty) {
      const warrantyVehicleCount = Number(body.warrantyVehicleCount);
      if (!Number.isInteger(warrantyVehicleCount) || warrantyVehicleCount < 0) {
        return badRequestResponse(event, 'Invalid warrantyVehicleCount');
      }

      const current = await getManualData(MANUAL_WARRANTY_SETTING_KEY);
      const next = {
        ...current,
        [month]: warrantyVehicleCount,
      };
      await saveManualData(
        MANUAL_WARRANTY_SETTING_KEY,
        next,
        `车辆产品售后反馈去年手动再保数量，最近更新人：${userinfo.username}`,
      );
      responsePayload.warrantyVehicleCount = warrantyVehicleCount;
    }

    return useResponseSuccess(responsePayload);
  } catch (error) {
    logApiError('vehicle-failure-rate-manual', error);
    return internalServerErrorResponse(
      event,
      `Failed to save manual vehicle feedback data: ${(error as Error).message}`,
    );
  }
});

async function saveManualData(
  key: string,
  value: Record<string, number>,
  description: string,
) {
  await prisma.system_settings.upsert({
    where: { key },
    update: {
      description,
      updatedAt: new Date(),
      value: JSON.stringify(value),
    },
    create: {
      description,
      key,
      value: JSON.stringify(value),
    },
  });
}

async function getManualData(key: string): Promise<Record<string, number>> {
  const setting = await prisma.system_settings.findUnique({
    where: { key },
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
