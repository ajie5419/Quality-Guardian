import { BusinessError } from '~/utils/business-error';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

type RequestBody = Record<string, unknown>;

export function isSerialNumberConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const message = String((error as { message?: string })?.message || '');
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targetStr = Array.isArray(target)
    ? target.join(',')
    : String(target ?? '');
  return message.includes('serialNumber') || targetStr.includes('serialNumber');
}

export function hasInspectionIssueResponsibilityUpdate(body: RequestBody) {
  return (
    body.responsibilityType !== undefined ||
    body.responsibleDepartmentId !== undefined ||
    body.supplierId !== undefined
  );
}

export function rejectSubmittedImportNcNumber(item: Record<string, unknown>) {
  for (const key of ['ncNumber', 'nonConformanceNumber'] as const) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      throw new BusinessError(
        'VALIDATION',
        '导入不支持手工填写不合格编号',
        400,
      );
    }
  }
}

export function mergeResponsibilityInput(
  body: RequestBody,
  current: {
    responsibilityType: null | string;
    responsibleDepartmentId: null | string;
    supplierId: null | string;
  },
) {
  return {
    responsibilityType: String(
      body.responsibilityType ?? current.responsibilityType ?? '',
    ).trim(),
    responsibleDepartmentId: String(
      body.responsibleDepartmentId ?? current.responsibleDepartmentId ?? '',
    ).trim(),
    supplierId: String(body.supplierId ?? current.supplierId ?? '').trim(),
  };
}
