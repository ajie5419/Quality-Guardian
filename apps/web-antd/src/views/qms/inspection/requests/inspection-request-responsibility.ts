import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import type { TreeSelectNode } from '#/types';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  resolveInspectionIssueResponsibilityTypeFromDepartment,
} from '@qgs/shared';

import { findIdByName } from '#/types';

type DepartmentIdentitySource = {
  department?: null | string;
  departmentId?: null | string;
};

function normalizeIdentityValue(value: unknown) {
  return String(value ?? '').trim();
}

function findDepartmentById(
  nodes: TreeSelectNode[],
  id: string,
): undefined | { id: string; name: string } {
  for (const node of nodes) {
    if (String(node.value) === id) {
      return { id: String(node.value), name: node.title };
    }
    const childMatch = node.children
      ? findDepartmentById(node.children, id)
      : undefined;
    if (childMatch) return childMatch;
  }
  return undefined;
}

export function resolveTreeDepartmentIdentity(
  nodes: TreeSelectNode[],
  source: DepartmentIdentitySource,
): { id: string; name: string } {
  const explicitId = normalizeIdentityValue(source.departmentId);
  const legacyValue = normalizeIdentityValue(source.department);
  const explicitMatch = explicitId
    ? findDepartmentById(nodes, explicitId)
    : undefined;
  if (explicitMatch) return explicitMatch;

  const legacyIdMatch = legacyValue
    ? findDepartmentById(nodes, legacyValue)
    : undefined;
  if (legacyIdMatch) return legacyIdMatch;

  const idByName = legacyValue ? findIdByName(nodes, legacyValue) : undefined;
  if (idByName !== undefined) {
    return { id: String(idByName), name: legacyValue };
  }

  return { id: explicitId, name: legacyValue };
}

export function resolveResponsibilityTypeFromDepartment(
  department: string,
  fallback: InspectionIssueResponsibilityType,
): InspectionIssueResponsibilityType {
  return resolveInspectionIssueResponsibilityTypeFromDepartment(
    department,
    fallback,
  );
}

export function resolveLinkedIssueResponsibilitySelection(
  nodes: TreeSelectNode[],
  source: {
    responsibilityType: InspectionIssueResponsibilityType;
    responsibleDepartment?: null | string;
    responsibleDepartmentId?: null | string;
    supplierId?: unknown;
    supplierName?: unknown;
  },
) {
  const department = resolveTreeDepartmentIdentity(nodes, {
    department: source.responsibleDepartment,
    departmentId: source.responsibleDepartmentId,
  });
  const responsibilityType = source.responsibilityType;
  const isInternal =
    responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;

  return {
    responsibilityType,
    responsibleDepartment: department.name,
    responsibleDepartmentId: department.id,
    supplierId: isInternal ? '' : normalizeIdentityValue(source.supplierId),
    supplierName: isInternal ? '' : normalizeIdentityValue(source.supplierName),
  };
}
