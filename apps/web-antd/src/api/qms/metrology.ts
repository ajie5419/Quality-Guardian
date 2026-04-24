import type {
  MetrologyBorrowInstrumentMatchItem,
  MetrologyBorrowListParams,
  MetrologyBorrowListResponse,
  MetrologyBorrowMutationPayload,
  MetrologyBorrowOverview,
  MetrologyBorrowRecordItem,
  MetrologyBorrowReturnPayload,
  MetrologyBorrowReturnRequestPayload,
  MetrologyCalibrationAnnualGridParams,
  MetrologyCalibrationAnnualRow,
  MetrologyCalibrationPlanItem,
  MetrologyCalibrationPlanListParams,
  MetrologyCalibrationPlanListResponse,
  MetrologyCalibrationPlanMutationPayload,
  MetrologyCalibrationPlanOverview,
  MetrologyItem,
  MetrologyListParams,
  MetrologyListResponse,
  MetrologyMutationPayload,
  MetrologyOverview,
} from '@qgs/shared';

import type { QmsImportSummary } from '#/api/qms/types';

import { normalizeListResponse } from '#/api/qms/adapters';
import { requestClient } from '#/api/request';

import { QMS_API, QMS_IMPORT_TIMEOUT } from './constants';

export * from '@qgs/shared';

export async function getMetrologyList(params?: MetrologyListParams) {
  return requestClient.get<MetrologyListResponse>(QMS_API.METROLOGY, {
    params,
  });
}

export async function getMetrologyListPage(params?: MetrologyListParams) {
  const raw = await getMetrologyList(params);
  return normalizeListResponse<MetrologyItem>(raw);
}

export async function getMetrologyExportList(params?: MetrologyListParams) {
  const raw = await requestClient.get<MetrologyListResponse>(
    QMS_API.METROLOGY_EXPORT,
    {
      params,
    },
  );
  return normalizeListResponse<MetrologyItem>(raw);
}

export async function getMetrologyOverview(params?: MetrologyListParams) {
  return requestClient.get<MetrologyOverview>(QMS_API.METROLOGY_OVERVIEW, {
    params,
  });
}

export async function importMetrology(data: {
  fileName?: string;
  items: Array<Record<string, unknown>>;
}) {
  return requestClient.post<QmsImportSummary>(QMS_API.METROLOGY_IMPORT, data, {
    timeout: QMS_IMPORT_TIMEOUT,
  });
}

export async function downloadMetrologyTemplate() {
  return requestClient.download<Blob>(QMS_API.METROLOGY_TEMPLATE);
}

export async function createMetrologyMutation(data: MetrologyMutationPayload) {
  return requestClient.post(QMS_API.METROLOGY, data);
}

export async function updateMetrologyMutation(
  id: string,
  data: MetrologyMutationPayload,
) {
  return requestClient.put(`${QMS_API.METROLOGY}/${id}`, data);
}

export async function deleteMetrologyMutation(id: string) {
  return requestClient.delete(`${QMS_API.METROLOGY}/${id}`);
}

export async function batchDeleteMetrologyMutation(ids: string[]) {
  return requestClient.post(QMS_API.METROLOGY_BATCH_DELETE, { ids });
}

export async function getMetrologyCalibrationPlanList(
  params?: MetrologyCalibrationPlanListParams,
) {
  return requestClient.get<MetrologyCalibrationPlanListResponse>(
    QMS_API.METROLOGY_CALIBRATION_PLAN,
    {
      params,
    },
  );
}

export async function getMetrologyCalibrationPlanListPage(
  params?: MetrologyCalibrationPlanListParams,
) {
  const raw = await getMetrologyCalibrationPlanList(params);
  return normalizeListResponse<MetrologyCalibrationPlanItem>(raw);
}

export async function getMetrologyCalibrationAnnualGrid(
  params?: MetrologyCalibrationAnnualGridParams,
) {
  return requestClient.get<MetrologyCalibrationAnnualRow[]>(
    QMS_API.METROLOGY_CALIBRATION_PLAN_ANNUAL_GRID,
    {
      params,
    },
  );
}

export async function getMetrologyCalibrationPlanOverview(
  params?: MetrologyCalibrationPlanListParams,
) {
  return requestClient.get<MetrologyCalibrationPlanOverview>(
    QMS_API.METROLOGY_CALIBRATION_PLAN_OVERVIEW,
    {
      params,
    },
  );
}

export async function createMetrologyCalibrationPlanMutation(
  data: MetrologyCalibrationPlanMutationPayload,
) {
  return requestClient.post(QMS_API.METROLOGY_CALIBRATION_PLAN, data);
}

export async function updateMetrologyCalibrationPlanMutation(
  id: string,
  data: MetrologyCalibrationPlanMutationPayload,
) {
  return requestClient.put(`${QMS_API.METROLOGY_CALIBRATION_PLAN}/${id}`, data);
}

export async function deleteMetrologyCalibrationPlanMutation(id: string) {
  return requestClient.delete(`${QMS_API.METROLOGY_CALIBRATION_PLAN}/${id}`);
}

export async function importMetrologyCalibrationPlan(data: {
  fileName?: string;
  items: Array<Record<string, unknown>>;
  year: number;
}) {
  return requestClient.post<QmsImportSummary>(
    QMS_API.METROLOGY_CALIBRATION_PLAN_IMPORT,
    data,
    {
      timeout: QMS_IMPORT_TIMEOUT,
    },
  );
}

export async function getMetrologyBorrowList(
  params?: MetrologyBorrowListParams,
) {
  return requestClient.get<MetrologyBorrowListResponse>(
    QMS_API.METROLOGY_BORROW,
    {
      params,
    },
  );
}

export async function getMetrologyBorrowListPage(
  params?: MetrologyBorrowListParams,
) {
  const raw = await getMetrologyBorrowList(params);
  return normalizeListResponse<MetrologyBorrowRecordItem>(raw);
}

export async function matchMetrologyBorrowInstruments(keyword: string) {
  return requestClient.get<MetrologyBorrowInstrumentMatchItem[]>(
    QMS_API.METROLOGY_BORROW_MATCH,
    {
      params: { keyword },
    },
  );
}

export async function matchPublicMetrologyBorrowInstruments(
  keyword: string,
  token?: string,
) {
  return requestClient.get<MetrologyBorrowInstrumentMatchItem[]>(
    QMS_API.PUBLIC_METROLOGY_BORROW_MATCH,
    {
      params: { keyword, token },
    },
  );
}

export async function getMetrologyBorrowOverview(
  params?: MetrologyBorrowListParams,
) {
  return requestClient.get<MetrologyBorrowOverview>(
    QMS_API.METROLOGY_BORROW_OVERVIEW,
    {
      params,
    },
  );
}

export async function createMetrologyBorrowMutation(
  data: MetrologyBorrowMutationPayload,
) {
  return requestClient.post(QMS_API.METROLOGY_BORROW, data);
}

export async function createPublicMetrologyBorrowMutation(
  data: MetrologyBorrowMutationPayload & { token?: string },
) {
  return requestClient.post(QMS_API.PUBLIC_METROLOGY_BORROW, data);
}

export async function returnMetrologyBorrowMutation(
  id: string,
  data: MetrologyBorrowReturnPayload,
) {
  return requestClient.post(`${QMS_API.METROLOGY_BORROW}/${id}/return`, data);
}

export async function returnPublicMetrologyBorrowMutation(
  id: string,
  data: MetrologyBorrowReturnRequestPayload & { token?: string },
) {
  return requestClient.post(
    `${QMS_API.PUBLIC_METROLOGY_BORROW}/${id}/return`,
    data,
  );
}

export namespace QmsMetrologyApi {
  export type MetrologyBorrowInstrumentMatchItem =
    import('@qgs/shared').MetrologyBorrowInstrumentMatchItem;
  export type MetrologyBorrowListParams =
    import('@qgs/shared').MetrologyBorrowListParams;
  export type MetrologyBorrowMutationPayload =
    import('@qgs/shared').MetrologyBorrowMutationPayload;
  export type MetrologyBorrowOverview =
    import('@qgs/shared').MetrologyBorrowOverview;
  export type MetrologyBorrowRecordItem =
    import('@qgs/shared').MetrologyBorrowRecordItem;
  export type MetrologyBorrowRecordStatus =
    import('@qgs/shared').MetrologyBorrowRecordStatus;
  export type MetrologyBorrowReturnPayload =
    import('@qgs/shared').MetrologyBorrowReturnPayload;
  export type MetrologyBorrowReturnRequestPayload =
    import('@qgs/shared').MetrologyBorrowReturnRequestPayload;
  export type MetrologyBorrowStatus =
    import('@qgs/shared').MetrologyBorrowStatus;
  export type MetrologyItem = import('@qgs/shared').MetrologyItem;
  export type MetrologyInspectionStatus =
    import('@qgs/shared').MetrologyInspectionStatus;
  export type MetrologyListParams = import('@qgs/shared').MetrologyListParams;
  export type MetrologyMutationPayload =
    import('@qgs/shared').MetrologyMutationPayload;
  export type MetrologyOverview = import('@qgs/shared').MetrologyOverview;
  export type MetrologyCalibrationPlanStatus =
    import('@qgs/shared').MetrologyCalibrationPlanStatus;
  export type MetrologyCalibrationPlanItem =
    import('@qgs/shared').MetrologyCalibrationPlanItem;
  export type MetrologyCalibrationPlanListParams =
    import('@qgs/shared').MetrologyCalibrationPlanListParams;
  export type MetrologyCalibrationPlanMutationPayload =
    import('@qgs/shared').MetrologyCalibrationPlanMutationPayload;
  export type MetrologyCalibrationAnnualRow =
    import('@qgs/shared').MetrologyCalibrationAnnualRow;
  export type MetrologyCalibrationPlanOverview =
    import('@qgs/shared').MetrologyCalibrationPlanOverview;
}
