import { SystemService } from '~/modules/system';

export const VEHICLE_FAILURE_MANUAL_SETTING_KEY =
  'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL';
export const VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY =
  'QMS_VEHICLE_FAILURE_LAST_YEAR_WARRANTY_MONTHLY_MANUAL';

export async function getVehicleFailureManualData(): Promise<
  Record<string, number>
> {
  return getManualSetting(VEHICLE_FAILURE_MANUAL_SETTING_KEY);
}

export async function getVehicleFailureManualWarrantyData(): Promise<
  Record<string, number>
> {
  return getManualSetting(VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY);
}

export async function saveVehicleFailureManualPayload(params: {
  count?: number;
  month: string;
  updatedBy?: string;
  warrantyVehicleCount?: number;
}) {
  const responsePayload: Record<string, unknown> = {
    month: params.month,
    success: true,
    updatedBy: params.updatedBy,
  };

  if (params.count !== undefined) {
    const current = await getVehicleFailureManualData();
    const next = {
      ...current,
      [params.month]: params.count,
    };
    await saveManualSetting(
      VEHICLE_FAILURE_MANUAL_SETTING_KEY,
      next,
      `车辆产品售后反馈去年手动数据，最近更新人：${params.updatedBy}`,
    );
    responsePayload.count = params.count;
  }

  if (params.warrantyVehicleCount !== undefined) {
    const current = await getVehicleFailureManualWarrantyData();
    const next = {
      ...current,
      [params.month]: params.warrantyVehicleCount,
    };
    await saveManualSetting(
      VEHICLE_FAILURE_MANUAL_WARRANTY_SETTING_KEY,
      next,
      `车辆产品售后反馈去年手动再保数量，最近更新人：${params.updatedBy}`,
    );
    responsePayload.warrantyVehicleCount = params.warrantyVehicleCount;
  }

  return responsePayload;
}

async function saveManualSetting(
  key: string,
  value: Record<string, number>,
  description: string,
) {
  await SystemService.saveSettingValue({
    description,
    key,
    value: JSON.stringify(value),
  });
}

async function getManualSetting(key: string): Promise<Record<string, number>> {
  const value = await SystemService.getSettingValue(key);
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([month, count]) => [month, Number(count)] as const)
        .filter(([, count]) => Number.isFinite(count)),
    );
  } catch {
    return {};
  }
}
