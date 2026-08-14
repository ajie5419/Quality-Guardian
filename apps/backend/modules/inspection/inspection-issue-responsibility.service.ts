import type { Prisma } from '@prisma/client';
import type {
  InspectionIssueResponsibilityType,
  SupplierCategory,
} from '@qgs/shared';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
  SUPPLIER_CATEGORY,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

export interface ResolvedInspectionIssueResponsibility {
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  responsibilityType: InspectionIssueResponsibilityType;
  supplierId: null | string;
  supplierCategory: null | SupplierCategory;
  supplierName: null | string;
}

/**
 * Resolves the canonical responsibility fact without importing issue creation.
 * Records, requests and issues share this boundary so responsibility checks
 * cannot pull quality-loss and inspection-core dependencies into record writes.
 */
export async function resolveInspectionIssueResponsibility(
  body: Record<string, unknown>,
  tx: Prisma.TransactionClient,
): Promise<ResolvedInspectionIssueResponsibility> {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    body.responsibilityType,
  );
  if (!responsibilityType) {
    throw new BusinessError('VALIDATION', '不合格项责任类型无效', 400);
  }
  const responsibleDepartmentId = normalizeResponsibilityId(
    body.responsibleDepartmentId,
  );
  if (!responsibleDepartmentId) {
    throw new BusinessError('VALIDATION', '不合格项责任部门 ID 不能为空', 400);
  }
  const department = await DeptService.findActiveById(
    responsibleDepartmentId,
    tx,
  );
  if (!department) {
    throw new BusinessError('VALIDATION', '不合格项责任部门 ID 无效', 400);
  }

  const submittedSupplierId = normalizeResponsibilityId(body.supplierId);
  if (
    responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    if (submittedSupplierId) {
      throw new BusinessError(
        'VALIDATION',
        '内部责任部门不能同时指定供应商 ID',
        400,
      );
    }
    return {
      responsibleDepartment: department.name,
      responsibleDepartmentId: department.id,
      responsibilityType,
      supplierId: null,
      supplierCategory: null,
      supplierName: null,
    };
  }
  if (!submittedSupplierId) {
    throw new BusinessError(
      'VALIDATION',
      '外部责任单位缺少 canonical 供应商 ID',
      400,
    );
  }
  const supplier = await SupplierIdentityService.resolveSupplierById(
    submittedSupplierId,
    tx,
  );
  if (!supplier) {
    throw new BusinessError('VALIDATION', '不合格项供应商 ID 无效', 400);
  }
  return {
    responsibleDepartment: department.name,
    responsibleDepartmentId: department.id,
    responsibilityType,
    supplierId: supplier.id,
    supplierCategory: resolveSupplierCategory(supplier.category),
    supplierName: supplier.name,
  };
}

function normalizeResponsibilityId(value: unknown) {
  return String(value ?? '').trim();
}

function resolveSupplierCategory(value: unknown): SupplierCategory {
  const category = String(value ?? '').trim();
  for (const allowedCategory of Object.values(SUPPLIER_CATEGORY)) {
    if (category === allowedCategory) return allowedCategory;
  }
  throw new BusinessError('VALIDATION', '不合格项供应商类别无效', 400);
}
