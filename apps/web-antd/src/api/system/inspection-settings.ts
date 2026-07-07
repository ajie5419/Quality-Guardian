import { requestClient } from '#/api/request';

export namespace InspectionSettingsApi {
  export interface ManualCreateSetting {
    enabled: boolean;
  }
}

/**
 * 获取"是否允许手动创建检验记录"设置
 */
export async function getInspectionManualCreateSettingApi() {
  return requestClient.get<InspectionSettingsApi.ManualCreateSetting>(
    '/system/settings/inspection-manual-create',
  );
}

/**
 * 更新"是否允许手动创建检验记录"设置
 */
export async function updateInspectionManualCreateSettingApi(data: {
  enabled: boolean;
}) {
  return requestClient.post('/system/settings/inspection-manual-create', data);
}
