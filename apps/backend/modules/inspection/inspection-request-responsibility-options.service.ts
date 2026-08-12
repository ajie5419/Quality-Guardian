import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityOptions,
} from '@qgs/shared';

import { getInspectionRequestResponsibilitySupplierCategory } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { SupplierService } from '~/modules/supplier';

export const InspectionRequestResponsibilityOptionsService = {
  async list(options: {
    keyword?: string;
    responsibilityType: InspectionIssueResponsibilityType;
  }): Promise<InspectionRequestResponsibilityOptions> {
    const keyword = String(options.keyword || '').trim();
    const supplierCategory = getInspectionRequestResponsibilitySupplierCategory(
      options.responsibilityType,
    );
    const [departments, suppliers] = await Promise.all([
      DeptService.listActiveOptions(keyword),
      supplierCategory
        ? SupplierService.listActiveOptions({
            category: supplierCategory,
            keyword,
          })
        : Promise.resolve([]),
    ]);
    return {
      departments,
      responsibilityType: options.responsibilityType,
      suppliers,
    };
  },
};
