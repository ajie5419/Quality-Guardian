import type { Prisma } from '@prisma/client';
import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityDepartmentOption,
} from '@qgs/shared';

import {
  INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { TeamIdentityService } from '~/modules/team';
import { BusinessError } from '~/utils/business-error';

type Client = Prisma.TransactionClient | undefined;

function fixedDepartmentName(type: InspectionIssueResponsibilityType) {
  if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER) {
    return INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  }
  if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT) {
    return OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  }
  return '';
}

export async function listInspectionRequestResponsibilityDepartments(options: {
  client?: Client;
  keyword?: string;
  responsibilityType: InspectionIssueResponsibilityType;
}): Promise<InspectionRequestResponsibilityDepartmentOption[]> {
  const fixedName = fixedDepartmentName(options.responsibilityType);
  if (!fixedName) return [];
  const departments = await DeptService.findActiveByIdsOrNames(
    { names: [fixedName] },
    options.client,
  );
  return departments.map((department) => ({
    label: department.name,
    value: department.id,
  }));
}

export async function assertInspectionRequestResponsibilityPolicy(options: {
  client: Prisma.TransactionClient;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  teamId?: null | string;
}) {
  if (
    options.responsibilityType !==
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    const departments = await listInspectionRequestResponsibilityDepartments({
      client: options.client,
      responsibilityType: options.responsibilityType,
    });
    const [department] = departments;
    if (
      departments.length !== 1 ||
      !department ||
      department.value !== options.responsibleDepartmentId
    ) {
      throw new BusinessError(
        'INSPECTION_REQUEST_RESPONSIBILITY_POLICY_MISMATCH',
        '责任部门不符合该外部责任类型的服务端责任策略',
        409,
      );
    }
    return;
  }
  const teamId = String(options.teamId || '').trim();
  if (!teamId) return;
  const sourceIds =
    await TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds(
      [teamId],
      options.client,
    );
  const departments = await DeptService.findActiveByIdsOrNames(
    { ids: sourceIds.get(teamId) || [] },
    options.client,
  );
  const [department] = departments;
  if (
    departments.length !== 1 ||
    !department ||
    department.id !== options.responsibleDepartmentId
  ) {
    throw new BusinessError(
      'INSPECTION_REQUEST_RESPONSIBILITY_POLICY_MISMATCH',
      '内部 TEAM 与责任部门 ID 不存在唯一有效对应关系',
      409,
    );
  }
}
