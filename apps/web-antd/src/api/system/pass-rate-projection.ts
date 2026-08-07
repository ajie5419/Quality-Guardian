import { requestClient } from '#/api/request';

export namespace PassRateProjectionApi {
  export interface Status {
    activeGeneration: null | {
      activatedAt: Date | null | string;
      createdAt: Date | string;
      id: string;
      status: string;
    };
    baselineMatch: boolean;
    enabled: boolean;
    failedOrBuildingGenerations: Array<{
      createdAt: Date | string;
      failureReason: null | string;
      id: string;
      status: string;
    }>;
    freshness: null | {
      isFresh: boolean;
      reason: null | string;
    };
    latestShadow: null | {
      completedAt: Date | null | string;
      coreDifferences: {
        PASS_COUNT: null | number;
        PASS_RATE: null | number;
        TOTAL_COUNT: null | number;
      };
      generationId: null | string;
      isCurrentGeneration: boolean;
    };
    rolloutReady: boolean;
  }
}

const BASE_URL = '/system/pass-rate-projection';

export function getPassRateProjectionStatusApi() {
  return requestClient.get<PassRateProjectionApi.Status>(`${BASE_URL}/status`);
}

export function updatePassRateProjectionEnabledApi(data: { enabled: boolean }) {
  return requestClient.put<PassRateProjectionApi.Status>(
    `${BASE_URL}/enabled`,
    data,
  );
}

export function rebuildPassRateProjectionApi(data?: { reason?: string }) {
  return requestClient.post(`${BASE_URL}/rebuild`, data || {});
}
