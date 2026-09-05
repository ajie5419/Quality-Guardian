import type { VehicleCommissioningIssue } from '@qgs/shared';

import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';

import { parseVehicleCommissioningIssueStatus } from './vehicle-commissioning-issue-format';

export function buildVehicleCommissioningIssuePayload(
  body: Record<string, unknown>,
  photos: string[],
  toNumber: (value: unknown) => number | undefined,
): Partial<VehicleCommissioningIssue> {
  return {
    assignee: body.assignee ? String(body.assignee) : undefined,
    date: body.date ? String(body.date) : undefined,
    description: body.description ? String(body.description) : undefined,
    isClaim:
      body.isClaim === undefined
        ? undefined
        : ['1', 'true', 'yes', '是'].includes(
            String(body.isClaim).toLowerCase(),
          ),
    lossAmount: toNumber(body.lossAmount),
    partName: body.partName ? String(body.partName) : undefined,
    photos,
    projectName: body.projectName ? String(body.projectName) : undefined,
    recoveredAmount: toNumber(body.recoveredAmount),
    ...buildGovernedWriteFieldsForTable('vehicle_commissioning_issues', {
      responsibleDepartment: body.responsibleDepartment
        ? String(body.responsibleDepartment)
        : undefined,
    }),
    claimNotes: body.claimNotes ? String(body.claimNotes) : undefined,
    claimStatus: body.claimStatus ? String(body.claimStatus) : undefined,
    severity: body.severity ? String(body.severity) : undefined,
    solution: body.solution ? String(body.solution) : undefined,
    status: body.status
      ? parseVehicleCommissioningIssueStatus(body.status)
      : undefined,
    title: body.title ? String(body.title) : undefined,
    workOrderNumber: body.workOrderNumber
      ? String(body.workOrderNumber)
      : undefined,
  };
}
