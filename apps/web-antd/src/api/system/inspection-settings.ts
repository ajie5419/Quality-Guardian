import { publicRequestClient, requestClient } from '#/api/request';

export namespace InspectionSettingsApi {
  export type ProcessCategory = 'INCOMING' | 'PROCESS';

  export interface ManualCreateSetting {
    enabled: boolean;
  }

  export interface IncomingMaterialInputSetting {
    incomingMaterialFreeInputEnabled: boolean;
  }

  export interface ProcessItem {
    categories: ProcessCategory[];
    code: null | string;
    id: string;
    name: string;
    responsibleDepartmentId: null | string;
    sort: number;
    status: number;
    supplierSource: 'Outsourcing' | 'Supplier';
  }

  export type ProcessSupplierSource = ProcessItem['supplierSource'];
}

export function getPublicIncomingMaterialInputSettingApi() {
  return publicRequestClient.get<InspectionSettingsApi.IncomingMaterialInputSetting>(
    '/qms/public/inspection/requests/settings',
  );
}

export function updateIncomingMaterialInputSettingApi(data: {
  enabled: boolean;
}) {
  return requestClient.post(
    '/system/settings/incoming-material-free-input',
    data,
  );
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

export function getInspectionProcessesApi() {
  return requestClient.get<InspectionSettingsApi.ProcessItem[]>(
    '/system/inspection-processes',
  );
}

export function createInspectionProcessApi(data: {
  categories: InspectionSettingsApi.ProcessCategory[];
  code?: null | string;
  name: string;
  responsibleDepartmentId?: null | string;
  sort?: number;
  supplierSource: InspectionSettingsApi.ProcessSupplierSource;
}) {
  return requestClient.post<InspectionSettingsApi.ProcessItem>(
    '/system/inspection-processes',
    data,
  );
}

export function updateInspectionProcessApi(
  id: string,
  data: {
    code?: null | string;
    name?: string;
    responsibleDepartmentId?: null | string;
    sort?: number;
    status?: 0 | 1;
    supplierSource?: InspectionSettingsApi.ProcessSupplierSource;
  },
) {
  return requestClient.put<InspectionSettingsApi.ProcessItem>(
    `/system/inspection-processes/${id}`,
    data,
  );
}

export function deleteInspectionProcessApi(id: string) {
  return requestClient.delete(`/system/inspection-processes/${id}`);
}

export function updateInspectionProcessSelectionApi(data: {
  incomingProcessIds: string[];
  processProcessIds: string[];
}) {
  return requestClient.put('/system/inspection-processes/selection', data);
}
