import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { TeamIdentityService } from '~/modules/team';
import { BusinessError } from '~/utils/business-error';

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
