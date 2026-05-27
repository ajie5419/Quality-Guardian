import type { Prisma } from '@prisma/client';
import type { UserSession } from '~/utils/jwt-utils';

import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from './inspection-issue';
import {
  normalizeInspectionRequestText,
} from './inspection-request';
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
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
  userinfo: UserSession;
}): Promise<CloseLinkedIssueCreateResult> {
  const linkedInspection = await findInspectionForIssue(options.inspectionId);
  const newId = createInspectionIssueId();
  const serialNumber = await getNextInspectionIssueSerialNumber();
  const issueBody = buildCloseLinkedIssueBody({
    body: options.body,
    inspectionId: options.inspectionId,
    linkedInspection,
    linkedIssue: options.linkedIssue,
    request: options.request,
  });

  return {
    auditVariables: {
      issue: issueBody.partName,
      nonConformanceNumber: newId,
    },
    createData: await buildInspectionIssueCreateData(issueBody, {
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
  request: {
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
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
    },
  );

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
    processName:
      normalizeInspectionRequestText(options.linkedIssue.processName) ||
      normalizeInspectionRequestText(resolveCanonicalProcessName(options.request)) ||
      options.request.processName,
    projectName:
      options.request.work_order?.projectName || options.request.workOrderNumber,
    quantity: issueQuantity,
    reportDate: normalizeInspectionRequestText(options.linkedIssue.reportDate),
    reportedBy:
      normalizeInspectionRequestText(options.linkedIssue.reportedBy) ||
      options.request.reporter,
    responsibleDepartment:
      normalizeInspectionRequestText(
        options.linkedIssue.responsibleDepartment,
      ) || '生产 OBU',
    responsibleWelder:
      normalizeInspectionRequestText(options.linkedIssue.responsibleWelder) ||
      undefined,
    rootCause: normalizeInspectionRequestText(options.linkedIssue.rootCause),
    severity:
      normalizeInspectionRequestText(options.linkedIssue.severity) || 'Minor',
    solution: normalizeInspectionRequestText(options.linkedIssue.solution),
    status: normalizeInspectionRequestText(options.linkedIssue.status) || 'OPEN',
    supplierName: normalizeInspectionRequestText(
      options.linkedIssue.supplierName,
    ),
    sourceType: 'INSPECTION_REQUEST',
    photos: Array.isArray(options.linkedIssue.photos)
      ? options.linkedIssue.photos
      : [],
    workOrderNumber: options.request.workOrderNumber,
  };
}
