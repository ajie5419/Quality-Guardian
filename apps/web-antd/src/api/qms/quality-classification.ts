import type {
  QualityClassificationCategory,
  QualityClassificationScope,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

export function getQualityClassificationOptionsApi(
  scope: QualityClassificationScope,
) {
  return requestClient.get<QualityClassificationCategory[]>(
    '/qms/common/quality-classification-options',
    { params: { scope } },
  );
}
