import { requestClient } from '#/api/request';

export namespace QmsQualityLossApi {
  export interface QualityLossItem {
    id: string;
    date: string;
    type: string;
    amount: number;
    description: string;
    responsibleDepartment: string;
    status: string;
    workOrderNumber?: string;
    projectName?: string;
    partName?: string;
    lossSource?: string;
    actualClaim?: number;
  }
}

/**
 * Get Quality Loss list
 */
export async function getQualityLossList() {
  return requestClient.get<QmsQualityLossApi.QualityLossItem[]>(
    '/qms/quality-loss',
  );
}

/**
 * Create Quality Loss record
 */
export async function createQualityLoss(
  data: Partial<QmsQualityLossApi.QualityLossItem>,
) {
  return requestClient.post<QmsQualityLossApi.QualityLossItem>(
    '/qms/quality-loss',
    data,
  );
}

export async function updateQualityLoss(
  id: string,
  data: Partial<QmsQualityLossApi.QualityLossItem>,
) {
  return requestClient.put<QmsQualityLossApi.QualityLossItem>(
    `/qms/quality-loss/${id}`,
    data,
  );
}

export async function deleteQualityLoss(id: string) {
  return requestClient.delete(`/qms/quality-loss/${id}`);
}
