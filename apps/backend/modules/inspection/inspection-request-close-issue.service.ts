import type { Prisma } from '@prisma/client';
import type { UserSession } from '~/utils/jwt-utils';

import {
  isIncomingInspectionRequestProcess,
  isOutsourcingInspectionRequestProcess,
  resolveInspectionRequestIssueResponsibility,
} from '@qgs/shared';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from './inspection-issue';
import { normalizeInspectionRequestText } from './inspection-request';
import { parseCloseRequestNumber } from './inspection-request-close.schema';

export interface CloseLinkedIssueCreateResult {
  auditVariables: { issue: string; nonConformanceNumber: string };
  createData: Prisma.quality_recordsCreateInput;
}

export async function buildCloseLinkedIssueCreateResult(options: {
  body: Record<string, unknown>;
  inspectionId: string;
  linkedIssue: Record<string, unknown>;
  request: {
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
  tx: Prisma.TransactionClient;
  userinfo: UserSession;
}): Promise<CloseLinkedIssueCreateResult> {
  const linkedInspection = await findInspectionForIssue(
    options.inspectionId,
    options.tx,
  );
  const newId = createInspectionIssueId();
  const serialNumber = await getNextInspectionIssueSerialNumber(options.tx);
  const linkedIssueProcessName = resolveCloseIssueProcessName({
    linkedIssue: options.linkedIssue,
    request: options.request,
  });
  const teamSupplier = await SupplierIdentityService.resolveSupplierByTeamId(
    options.request.teamId,
  );
  const issueBody = buildCloseLinkedIssueBody({
    body: options.body,
    inspectionId: options.inspectionId,
    teamSupplier,
    linkedInspection,
    linkedIssue: options.linkedIssue,
    ncNumber: normalizeInspectionRequestText(options.linkedIssue.ncNumber),
    processName: linkedIssueProcessName,
    request: options.request,
  });

  return {
    auditVariables: {
      issue: issueBody.partName,
      nonConformanceNumber: issueBody.ncNumber,
    },
    createData: await buildInspectionIssueCreateData(issueBody, {
      createdBy:
        String(options.userinfo.id || options.userinfo.userId || '') ||
        undefined,
      id: newId,
      inspection: linkedInspection,
      inspectorUsername: options.userinfo.username,
      serialNumber,
    }),
  };
}

function buildCloseLinkedIssueBody(options: {
  body: Record<string, unknown>;
  inspectionId: string;
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  ncNumber: string;
  processName: string;
  request: {
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
  teamSupplier: null | { id: string; name: string };
}) {
  const issueQuantity = Math.max(
    1,
    Math.trunc(
      parseCloseRequestNumber(
        options.linkedIssue.quantity,
        parseCloseRequestNumber(options.body.unqualifiedQuantity, 1),
      ),
    ),
  );
  const governedIssueFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    {
      defectSubtype: normalizeInspectionRequestText(
        options.linkedIssue.defectSubtype,
      ),
      defectType:
        normalizeInspectionRequestText(options.linkedIssue.defectType) ||
        '制造缺陷',
      division:
        normalizeInspectionRequestText(options.linkedIssue.division) ||
        options.linkedInspection?.work_order?.division ||
        undefined,
      divisionId:
        normalizeInspectionRequestText(options.linkedIssue.divisionId) ||
        options.linkedInspection?.work_order?.divisionId ||
        undefined,
    },
  );
  const issueResponsibility = resolveCloseIssueResponsibility({
    teamSupplier: options.teamSupplier,
    linkedIssue: options.linkedIssue,
    processName: options.processName,
    team: options.request.team,
  });

  return {
    claim: normalizeInspectionRequestText(options.linkedIssue.claim) || 'No',
    ...governedIssueFields,
    description: normalizeInspectionRequestText(
      options.linkedIssue.description,
    ),
    inspectionId: options.inspectionId,
    lossAmount: Number(options.linkedIssue.lossAmount || 0),
    partName:
      normalizeInspectionRequestText(options.linkedIssue.partName) ||
      normalizeInspectionRequestText(options.request.componentName) ||
      options.request.partName,
    processName: options.processName,
    projectName:
      options.request.work_order?.projectName ||
      options.request.workOrderNumber,
    quantity: issueQuantity,
    ncNumber: options.ncNumber,
    reportDate: normalizeInspectionRequestText(options.linkedIssue.reportDate),
    reportedBy:
      normalizeInspectionRequestText(options.linkedIssue.reportedBy) ||
      options.request.reporter,
    responsibleDepartment: issueResponsibility.responsibleDepartment,
    responsibleWelder:
      normalizeInspectionRequestText(options.linkedIssue.responsibleWelder) ||
      undefined,
    rootCause: normalizeInspectionRequestText(options.linkedIssue.rootCause),
    severity:
      normalizeInspectionRequestText(options.linkedIssue.severity) || 'Minor',
    solution: normalizeInspectionRequestText(options.linkedIssue.solution),
    status:
      normalizeInspectionRequestText(options.linkedIssue.status) || 'OPEN',
    supplierName: issueResponsibility.supplierName,
    supplierId: issueResponsibility.supplierId,
    sourceType: 'INSPECTION_REQUEST',
    photos: Array.isArray(options.linkedIssue.photos)
      ? options.linkedIssue.photos
      : [],
    workOrderNumber: options.request.workOrderNumber,
  };
}

function resolveCloseIssueProcessName(options: {
  linkedIssue: Record<string, unknown>;
  request: {
    process?: null | { name?: null | string };
    processName: string;
  };
}) {
  return (
    normalizeInspectionRequestText(options.linkedIssue.processName) ||
    normalizeInspectionRequestText(
      resolveCanonicalProcessName(options.request),
    ) ||
    options.request.processName
  );
}

function resolveCloseIssueResponsibility(options: {
  linkedIssue: Record<string, unknown>;
  processName: string;
  team?: null | string;
  teamSupplier: null | { id: string; name: string };
}) {
  const defaults = resolveInspectionRequestIssueResponsibility({
    processName: options.processName,
    team: options.team,
  });
  const isExternal =
    isIncomingInspectionRequestProcess(options.processName) ||
    isOutsourcingInspectionRequestProcess(options.processName) ||
    Boolean(options.teamSupplier);
  const explicitSupplierName = normalizeInspectionRequestText(
    options.linkedIssue.supplierName,
  );

  if (isExternal) {
    const externalDefaults = options.teamSupplier
      ? resolveInspectionRequestIssueResponsibility({
          processName: '外协',
          team: options.team,
        })
      : defaults;
    return {
      responsibleDepartment: externalDefaults.responsibleDepartment,
      supplierId: options.teamSupplier?.id,
      supplierName:
        options.teamSupplier?.name ||
        explicitSupplierName ||
        externalDefaults.supplierName,
    };
  }

  return {
    responsibleDepartment:
      normalizeInspectionRequestText(
        options.linkedIssue.responsibleDepartment,
      ) || defaults.responsibleDepartment,
    supplierName: explicitSupplierName,
    supplierId: undefined,
  };
}
