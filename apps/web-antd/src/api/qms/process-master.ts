import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { requestClient } from '#/api/request';

export interface ProcessMasterOption extends DictionaryOptionItem {
  inspectionRequestCategory?: null | string;
  supplierSource?: null | string;
}

export function getProcessMasterOptionsApi() {
  return requestClient.get<ProcessMasterOption[]>(
    '/qms/common/process-options',
  );
}
