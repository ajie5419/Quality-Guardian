import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { requestClient } from '#/api/request';

export function getProcessMasterOptionsApi() {
  return requestClient.get<DictionaryOptionItem[]>(
    '/qms/common/process-options',
  );
}
