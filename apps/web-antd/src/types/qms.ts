import type { UploadFileWithResponse } from './common';

import type { AfterSalesItem } from '#/api/qms/after-sales';

/**
 * 售后工单表单状态
 */
export interface AfterSalesFormState
  extends Omit<Partial<AfterSalesItem>, 'photos'> {
  photos?: UploadFileWithResponse[];
}
