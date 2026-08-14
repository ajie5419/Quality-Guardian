import type { Prisma } from '@prisma/client';
import type {
  InspectionIssueResponsibilityType,
  SupplierCategory,
} from '@qgs/shared';

import { inspection_category } from '@prisma/client';
import {
  getInspectionRequestResponsibilitySupplierCategory,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { normalizeInspectionRequestText } from './inspection-request';
import { failCloseRequest } from './inspection-request-close.schema';
import { resolveProcessOutsourcingResponsibleDepartmentId } from './inspection-request-responsibility-default.service';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

type Request = {
  category?: null | string;
  id: string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
  teamId?: null | string;
};

type InspectionResponsibility = {
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
};

type ResponsibilityTuple = Pick<
  InspectionResponsibility,
  'responsibilityType' | 'responsibleDepartmentId' | 'supplierId'
>;

export type CanonicalCloseResponsibility = {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  supplierId: null | string;
  supplierName: null | string;
};

function hasCompleteResponsibilityFact(request: Omit<Request, 'id'>) {
  const type = normalizeInspectionIssueResponsibilityType(
    request.responsibilityType,
  );
  if (
    !type ||
    !normalizeInspectionRequestText(request.responsibleDepartmentId) ||
    !normalizeInspectionRequestText(request.responsibleDepartment)
  ) {
    return false;
  }
  return type === 'INTERNAL_DEPARTMENT'
    ? !normalizeInspectionRequestText(request.supplierId) &&
        !normalizeInspectionRequestText(request.supplierName)
    : Boolean(
        normalizeInspectionRequestText(request.supplierId) &&
          normalizeInspectionRequestText(request.supplierName),
      );
}

function hasCompleteResponsibilityIdentity(request: Omit<Request, 'id'>) {
  const type = normalizeInspectionIssueResponsibilityType(
    request.responsibilityType,
  );
  if (
    !type ||
    !normalizeInspectionRequestText(request.responsibleDepartmentId)
  ) {
    return false;
  }
  return type === 'INTERNAL_DEPARTMENT'
    ? !normalizeInspectionRequestText(request.supplierId)
    : Boolean(normalizeInspectionRequestText(request.supplierId));
}

function assertCompatibleLegacyResponsibility(
  request: Request,
  responsibility: CanonicalCloseResponsibility,
) {
  const persistedType = normalizeInspectionRequestText(
    request.responsibilityType,
  );
  const normalizedPersistedType =
    normalizeInspectionIssueResponsibilityType(persistedType);
  if (
    persistedType &&
    normalizedPersistedType !== responsibility.responsibilityType
  ) {
    failCloseRequest('VALIDATION', '报检任务存在冲突的责任类型事实');
  }
  for (const [persisted, expected, label] of [
    [
      request.responsibleDepartmentId,
      responsibility.responsibleDepartmentId,
      '责任部门 ID',
    ],
    [request.supplierId, responsibility.supplierId, '供应商 ID'],
  ] as const) {
    const actual = normalizeInspectionRequestText(persisted);
    if (actual && actual !== (expected || '')) {
      failCloseRequest('VALIDATION', `报检任务存在冲突的${label}责任事实`);
    }
  }
}

function assertCloseResponsibilityTupleMatches(options: {
  actual: ResponsibilityTuple;
  code: string;
  message: string;
  responsibility: CanonicalCloseResponsibility;
}) {
  const actualType = normalizeInspectionIssueResponsibilityType(
    options.actual.responsibilityType,
  );
  const actualDepartmentId = normalizeInspectionRequestText(
    options.actual.responsibleDepartmentId,
  );
  const actualSupplierId = normalizeInspectionRequestText(
    options.actual.supplierId,
  );
  if (
    actualType !== options.responsibility.responsibilityType ||
    actualDepartmentId !== options.responsibility.responsibleDepartmentId ||
    actualSupplierId !== (options.responsibility.supplierId || '')
  ) {
    failCloseRequest(options.code, options.message);
  }
}

export function assertCloseLinkedIssueResponsibilityMatches(options: {
  linkedIssue: ResponsibilityTuple;
  responsibility: CanonicalCloseResponsibility;
}) {
  assertCloseResponsibilityTupleMatches({
    actual: options.linkedIssue,
    code: 'VALIDATION',
    message: '不合格项责任归属必须与关闭责任归属一致',
    responsibility: options.responsibility,
  });
}

export function assertExistingCloseLinkedIssueResponsibilityMatches(options: {
  issue: ResponsibilityTuple;
  responsibility: CanonicalCloseResponsibility;
}) {
  assertCloseResponsibilityTupleMatches({
    actual: options.issue,
    code: 'CONFLICT',
    message: '已关联不合格项责任事实与关闭责任归属不一致',
    responsibility: options.responsibility,
  });
}

async function assertCloseResponsibilityCategoryPolicy(options: {
  request: Request;
  responsibility: CanonicalCloseResponsibility;
  supplierCategory: null | SupplierCategory;
}) {
  if (
    options.request.category === 'PROCESS' &&
    options.responsibility.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
  ) {
    failCloseRequest('VALIDATION', 'PROCESS 报检任务不能使用供应商责任类型');
  }
  const expectedSupplierCategory =
    getInspectionRequestResponsibilitySupplierCategory(
      options.responsibility.responsibilityType,
    );
  if (!expectedSupplierCategory) return;
  if (options.supplierCategory !== expectedSupplierCategory) {
    failCloseRequest('VALIDATION', '供应商类别与责任类型不匹配');
  }
}

function hasCanonicalResponsibilitySnapshot(
  request: Request,
  responsibility: CanonicalCloseResponsibility,
) {
  return (
    normalizeInspectionIssueResponsibilityType(request.responsibilityType) ===
      responsibility.responsibilityType &&
    normalizeInspectionRequestText(request.responsibleDepartment) ===
      responsibility.responsibleDepartment &&
    normalizeInspectionRequestText(request.responsibleDepartmentId) ===
      responsibility.responsibleDepartmentId &&
    (normalizeInspectionRequestText(request.supplierId) || null) ===
      responsibility.supplierId &&
    (normalizeInspectionRequestText(request.supplierName) || null) ===
      responsibility.supplierName
  );
}

function resolveRequestCategoryForCas(category: Request['category']) {
  if (category === inspection_category.INCOMING)
    return inspection_category.INCOMING;
  if (category === inspection_category.PROCESS)
    return inspection_category.PROCESS;
  return null;
}

async function persistCanonicalResponsibilitySnapshot(options: {
  request: Request;
  responsibility: CanonicalCloseResponsibility;
  tx: Prisma.TransactionClient;
}) {
  if (
    hasCanonicalResponsibilitySnapshot(options.request, options.responsibility)
  ) {
    return false;
  }
  const persisted = await options.tx.qms_inspection_requests.updateMany({
    data: options.responsibility,
    where: {
      category: resolveRequestCategoryForCas(options.request.category),
      id: options.request.id,
      isDeleted: false,
      responsibilityType: options.request.responsibilityType ?? null,
      responsibleDepartment: options.request.responsibleDepartment ?? null,
      responsibleDepartmentId: options.request.responsibleDepartmentId ?? null,
      supplierId: options.request.supplierId ?? null,
      supplierName: options.request.supplierName ?? null,
      // The selected internal department is validated against this TEAM.
      // A concurrent TEAM change must therefore invalidate the same CAS write.
      teamId: options.request.teamId ?? null,
    },
  });
  if (persisted.count !== 1) {
    failCloseRequest('CONFLICT', '报检任务责任事实已被并发修改，请刷新后重试');
  }
  return true;
}

function applyCanonicalResponsibility<T extends Request>(
  request: T,
  responsibility: CanonicalCloseResponsibility,
) {
  return {
    ...request,
    responsibilityType: responsibility.responsibilityType,
    responsibleDepartment: responsibility.responsibleDepartment,
    responsibleDepartmentId: responsibility.responsibleDepartmentId,
    supplierId: responsibility.supplierId,
    supplierName: responsibility.supplierName,
  } as CanonicalCloseResponsibility & T;
}

async function resolveSubmittedCloseResponsibility(options: {
  responsibility: Record<string, unknown>;
  tx: Prisma.TransactionClient;
}) {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    options.responsibility.responsibilityType,
  );
  if (
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  ) {
    if (
      normalizeInspectionRequestText(
        options.responsibility.responsibleDepartmentId,
      )
    ) {
      failCloseRequest('VALIDATION', '外协责任部门由系统配置解析');
    }
    return resolveInspectionIssueResponsibility(
      {
        ...options.responsibility,
        responsibleDepartmentId:
          await resolveProcessOutsourcingResponsibleDepartmentId(options.tx),
      },
      options.tx,
    );
  }
  return resolveInspectionIssueResponsibility(
    options.responsibility,
    options.tx,
  );
}

/**
 * Closing is the boundary where one request responsibility becomes durable on
 * every generated inspection and its linked NC. Only the request may supply
 * this fact; an existing inspection can never replace it.
 */
export function requireCanonicalCloseResponsibility(
  request: Omit<Request, 'id'>,
): CanonicalCloseResponsibility {
  if (!hasCompleteResponsibilityFact(request)) {
    failCloseRequest('VALIDATION', '报检任务责任事实不完整，不能关闭');
  }
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    request.responsibilityType,
  );
  if (!responsibilityType) {
    failCloseRequest('VALIDATION', '报检任务责任类型无效，不能关闭');
  }
  return {
    responsibilityType,
    responsibleDepartment: normalizeInspectionRequestText(
      request.responsibleDepartment,
    ),
    responsibleDepartmentId: normalizeInspectionRequestText(
      request.responsibleDepartmentId,
    ),
    supplierId: normalizeInspectionRequestText(request.supplierId) || null,
    supplierName: normalizeInspectionRequestText(request.supplierName) || null,
  };
}

/**
 * Existing records with no identity may be projected from the request during
 * close. A partial or conflicting canonical identity must abort the same
 * transaction instead of letting a display fallback hide the data defect.
 */
export function buildCloseInspectionResponsibilityWrite(options: {
  inspection?: InspectionResponsibility | null;
  request: Request;
}) {
  const expected = requireCanonicalCloseResponsibility(options.request);
  const inspection = options.inspection;
  if (!inspection) return expected;

  const actualType = normalizeInspectionRequestText(
    inspection.responsibilityType,
  );
  const actualDepartmentId = normalizeInspectionRequestText(
    inspection.responsibleDepartmentId,
  );
  const actualSupplierId = normalizeInspectionRequestText(
    inspection.supplierId,
  );
  const actualDepartment = normalizeInspectionRequestText(
    inspection.responsibleDepartment,
  );
  const actualSupplierName = normalizeInspectionRequestText(
    inspection.supplierName,
  );
  const hasIdentity = Boolean(
    actualType ||
      actualDepartmentId ||
      actualDepartment ||
      actualSupplierId ||
      actualSupplierName,
  );
  if (!hasIdentity) return expected;

  const supplierMatches =
    actualSupplierId === (expected.supplierId || '') &&
    actualSupplierName === (expected.supplierName || '') &&
    (expected.responsibilityType === 'INTERNAL_DEPARTMENT'
      ? !actualSupplierId
      : Boolean(actualSupplierId));
  if (
    actualType !== expected.responsibilityType ||
    actualDepartmentId !== expected.responsibleDepartmentId ||
    actualDepartment !== expected.responsibleDepartment ||
    !supplierMatches
  ) {
    failCloseRequest('CONFLICT', '关联检验记录责任事实与报检任务不一致');
  }
  return expected;
}

/**
 * A historical request may contain a partial responsibility snapshot. A close
 * can complete it only from the separately submitted canonical responsibility;
 * FAIL issue data never becomes the request responsibility source.
 */
export async function resolveLegacyCloseRequestResponsibility<
  T extends Request,
>(options: {
  request: T;
  responsibility?: Record<string, unknown>;
  tx: Prisma.TransactionClient;
}) {
  const submittedResponsibility = options.responsibility
    ? await resolveSubmittedCloseResponsibility({
        responsibility: options.responsibility,
        tx: options.tx,
      })
    : null;
  if (hasCompleteResponsibilityIdentity(options.request)) {
    const resolved = await resolveInspectionIssueResponsibility(
      {
        responsibilityType: options.request.responsibilityType,
        responsibleDepartmentId: options.request.responsibleDepartmentId,
        supplierId: options.request.supplierId,
      },
      options.tx,
    );
    const responsibility: CanonicalCloseResponsibility = {
      responsibilityType: resolved.responsibilityType,
      responsibleDepartment: resolved.responsibleDepartment,
      responsibleDepartmentId: resolved.responsibleDepartmentId,
      supplierId: resolved.supplierId,
      supplierName: resolved.supplierName,
    };
    await assertInspectionRequestResponsibilityPolicy({
      client: options.tx,
      responsibleDepartmentId: responsibility.responsibleDepartmentId,
      responsibilityType: responsibility.responsibilityType,
      teamId:
        responsibility.responsibilityType === 'INTERNAL_DEPARTMENT'
          ? options.request.teamId
          : null,
    });
    await assertCloseResponsibilityCategoryPolicy({
      request: options.request,
      responsibility,
      supplierCategory: resolved.supplierCategory,
    });
    if (submittedResponsibility) {
      assertCompatibleLegacyResponsibility(
        options.request,
        submittedResponsibility,
      );
      if (
        submittedResponsibility.responsibilityType !==
          responsibility.responsibilityType ||
        submittedResponsibility.responsibleDepartmentId !==
          responsibility.responsibleDepartmentId ||
        submittedResponsibility.supplierId !== responsibility.supplierId
      ) {
        failCloseRequest('VALIDATION', '关闭责任归属与报检任务不一致');
      }
    }
    const refreshed = await persistCanonicalResponsibilitySnapshot({
      request: options.request,
      responsibility,
      tx: options.tx,
    });
    return {
      request: applyCanonicalResponsibility(options.request, responsibility),
      resolvedLegacy: refreshed,
    };
  }
  if (!submittedResponsibility) {
    failCloseRequest('VALIDATION', '报检任务责任事实缺失，不能关闭');
  }
  const responsibility = submittedResponsibility;
  await assertInspectionRequestResponsibilityPolicy({
    client: options.tx,
    responsibleDepartmentId: responsibility.responsibleDepartmentId,
    responsibilityType: responsibility.responsibilityType,
    teamId:
      responsibility.responsibilityType === 'INTERNAL_DEPARTMENT'
        ? options.request.teamId
        : null,
  });
  await assertCloseResponsibilityCategoryPolicy({
    request: options.request,
    responsibility,
    supplierCategory: responsibility.supplierCategory,
  });
  assertCompatibleLegacyResponsibility(options.request, responsibility);
  await persistCanonicalResponsibilitySnapshot({
    request: options.request,
    responsibility,
    tx: options.tx,
  });
  return {
    request: applyCanonicalResponsibility(options.request, responsibility),
    resolvedLegacy: true,
  };
}
