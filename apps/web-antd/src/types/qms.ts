import type { AfterSalesItem } from '@qgs/shared';

import type { UploadFileWithResponse } from './common';

/**
 * 售后工单表单状态
 */
export interface AfterSalesFormState
  extends Omit<Partial<AfterSalesItem>, 'photos'> {
  photos?: UploadFileWithResponse[];
}
