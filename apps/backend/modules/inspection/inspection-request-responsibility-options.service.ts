import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityOptions,
} from '@qgs/shared';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  SUPPLIER_CATEGORY,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { SupplierService } from '~/modules/supplier';

import { listInspectionRequestResponsibilityDepartments } from './inspection-request-responsibility-policy.service';

export const InspectionRequestResponsibilityOptionsService = {
  async list(options: {
    keyword?: string;
    responsibilityType: InspectionIssueResponsibilityType;
  }): Promise<InspectionRequestResponsibilityOptions> {
    const keyword = String(options.keyword || '').trim();
    const isInternal =
      options.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
    const departments = isInternal
      ? await DeptService.listActiveOptions(keyword)
      : await listInspectionRequestResponsibilityDepartments({
          keyword,
          responsibilityType: options.responsibilityType,
        });
    const suppliers = isInternal
      ? []
      : await SupplierService.listActiveOptions({
          category:
            options.responsibilityType ===
            INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
              ? SUPPLIER_CATEGORY.OUTSOURCING
              : SUPPLIER_CATEGORY.SUPPLIER,
          keyword,
        });
    return {
      departments,
      responsibilityType: options.responsibilityType,
      suppliers,
    };
  },
};
