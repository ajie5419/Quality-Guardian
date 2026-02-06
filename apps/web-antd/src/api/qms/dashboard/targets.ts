import { requestClient } from '#/api/request';

import { QMS_API } from '../constants';

export type PassRateTargets = Record<string, number>;

/**
 * 获取及配置 QMS 各工序目标合格率
 */
export async function getPassRateTargets(): Promise<PassRateTargets> {
  const res = await requestClient.get<PassRateTargets>(
    QMS_API.DASHBOARD_TARGETS,
  );
  return res;
}

export async function updatePassRateTargets(targets: PassRateTargets) {
  return requestClient.post(QMS_API.DASHBOARD_TARGETS, targets);
}
