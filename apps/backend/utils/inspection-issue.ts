import {
  buildInspectionIssueDateRange,
  hasInspectionIssueAdminAccess,
  hasInspectionIssueWriteAccess,
  normalizeOptionalInspectionIssueDate,
  normalizeOptionalInspectionIssueNumber,
  normalizeOptionalInspectionIssueString,
  parseInspectionIssueDateMode,
  parseInspectionIssueDateValue,
  parseInspectionIssueListQuery,
  parseOptionalIssueYear,
} from '@qgs/domain';
import { nanoid } from 'nanoid';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';

import prisma from './prisma';

export {
  buildInspectionIssueDateRange,
  hasInspectionIssueAdminAccess,
  hasInspectionIssueWriteAccess,
  normalizeOptionalInspectionIssueDate,
  normalizeOptionalInspectionIssueNumber,
  normalizeOptionalInspectionIssueString,
  parseInspectionIssueDateMode,
  parseInspectionIssueDateValue,
  parseInspectionIssueListQuery,
  parseOptionalIssueYear,
};

export function createInspectionIssueId(): string {
  return `ISS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}

export async function getNextInspectionIssueSerialNumber(): Promise<number> {
  const result = await prisma.quality_records.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

interface InspectionIssueImportItem {
  description?: unknown;
  division?: unknown;
  ncNumber?: unknown;
  nonConformanceNumber?: unknown;
  partName?: unknown;
  projectName?: unknown;
  quantity?: unknown;
  responsibleDepartment?: unknown;
  responsibleWelder?: unknown;
  status?: unknown;
  workOrderNumber?: unknown;
}

export async function findInspectionIssueAccessRecord(id: string) {
  return prisma.quality_records.findUnique({
    where: { id },
    select: { inspector: true, nonConformanceNumber: true, inspectionId: true },
  });
}

function deriveIssuePartNameFromInspection(inspection?: {
  category: string;
  level1Component: null | string;
  level2Component: null | string;
  materialName: null | string;
  processName: null | string;
}) {
  if (!inspection) {
    return undefined;
  }
  if (inspection.category === 'PROCESS') {
    return (
      inspection.level2Component ||
      inspection.level1Component ||
      inspection.processName ||
      undefined
    );
  }

  return inspection.materialName || inspection.level2Component || undefined;
}

function deriveIssueProcessNameFromInspection(inspection?: {
  category: string;
  incomingType: null | string;
  processName: null | string;
}) {
  if (!inspection) {
    return undefined;
  }
  if (inspection.category === 'INCOMING') {
    return inspection.incomingType || inspection.processName || undefined;
  }

  if (inspection.category === 'SHIPMENT') {
    return '成品检验';
  }

  return inspection.processName || undefined;
}

export async function findInspectionForIssue(inspectionId?: string) {
  const normalizedId = normalizeOptionalInspectionIssueString(inspectionId);
  if (!normalizedId) {
    return null;
  }

  return prisma.inspections.findUnique({
    where: { id: normalizedId },
    include: {
      work_order: {
        select: {
          division: true,
        },
      },
    },
  });
}

export function buildInspectionIssueCreateData(
  body: Record<string, unknown>,
  options: {
    id: string;
    inspection?: Awaited<ReturnType<typeof findInspectionForIssue>>;
    inspectorUsername?: string;
    serialNumber: number;
  },
) {
  const issueDate =
    normalizeOptionalInspectionIssueDate(body.reportDate) ?? new Date();
  const linkedInspection = options.inspection;
  const workOrderNumber =
    linkedInspection?.workOrderNumber ||
    normalizeOptionalInspectionIssueString(body.workOrderNumber);
  const projectName =
    linkedInspection?.projectName ||
    normalizeOptionalInspectionIssueString(body.projectName);
  const processName =
    deriveIssueProcessNameFromInspection(linkedInspection || undefined) ||
    normalizeOptionalInspectionIssueString(body.processName);
  const partName =
    normalizeOptionalInspectionIssueString(body.partName) ||
    deriveIssuePartNameFromInspection(linkedInspection || undefined) ||
    'Unknown';
  const supplierName =
    linkedInspection?.supplierName ||
    normalizeOptionalInspectionIssueString(body.supplierName);
  const division =
    linkedInspection?.work_order?.division ||
    normalizeOptionalInspectionIssueString(body.division);
  const quantity =
    normalizeOptionalInspectionIssueNumber(body.quantity) ??
    linkedInspection?.quantity ??
    1;

  return {
    id: options.id,
    serialNumber: options.serialNumber,
    date: issueDate,
    inspection: linkedInspection
      ? {
          connect: {
            id: linkedInspection.id,
          },
        }
      : undefined,
    status: toQualityRecordStatus(
      normalizeOptionalInspectionIssueString(body.status),
    ),
    nonConformanceNumber:
      normalizeOptionalInspectionIssueString(body.ncNumber) ?? null,
    work_orders: workOrderNumber
      ? {
          connect: {
            workOrderNumber,
          },
        }
      : undefined,
    projectName,
    processName,
    partName,
    division,
    defectType: normalizeOptionalInspectionIssueString(body.defectType),
    defectSubtype: normalizeOptionalInspectionIssueString(body.defectSubtype),
    severity: normalizeOptionalInspectionIssueString(body.severity) ?? 'Minor',
    rootCause: normalizeOptionalInspectionIssueString(body.rootCause),
    solution: normalizeOptionalInspectionIssueString(body.solution),
    description: normalizeOptionalInspectionIssueString(body.description),
    quantity,
    lossAmount: normalizeOptionalInspectionIssueNumber(body.lossAmount) ?? 0,
    responsibleDepartment:
      normalizeOptionalInspectionIssueString(body.responsibleDepartment) ??
      'Unknown',
    responsibleWelder:
      normalizeOptionalInspectionIssueString(body.responsibleWelder) ?? null,
    supplierName: supplierName ?? null,
    category:
      linkedInspection?.category ??
      normalizeOptionalInspectionIssueString(body.category),
    users_quality_records_inspectorTousers: options.inspectorUsername
      ? { connect: { username: options.inspectorUsername } }
      : undefined,
    isClaim: body.claim === 'Yes' || body.claim === true,
    issuePhoto:
      body.photos === undefined ? '[]' : JSON.stringify(body.photos ?? []),
    isDeleted: false,
    updatedAt: new Date(),
  };
}

export function buildInspectionIssueUpdateData(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.ncNumber !== undefined && body.ncNumber !== existingNcNumber) {
    updateData.nonConformanceNumber =
      normalizeOptionalInspectionIssueString(body.ncNumber) ?? null;
  }

  const stringFields = [
    'workOrderNumber',
    'projectName',
    'processName',
    'partName',
    'inspector',
    'description',
    'responsibleDepartment',
    'responsibleWelder',
    'supplierName',
    'rootCause',
    'solution',
    'defectType',
    'defectSubtype',
    'severity',
  ];
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updateData[field] =
        normalizeOptionalInspectionIssueString(body[field]) ?? null;
    }
  }

  const quantity = normalizeOptionalInspectionIssueNumber(body.quantity);
  if (quantity !== undefined) {
    updateData.quantity = quantity;
  }

  const lossAmount = normalizeOptionalInspectionIssueNumber(body.lossAmount);
  if (lossAmount !== undefined) {
    updateData.lossAmount = lossAmount;
  }

  const reportDate = normalizeOptionalInspectionIssueDate(body.reportDate);
  if (reportDate) {
    updateData.date = reportDate;
  }

  if (body.photos !== undefined) {
    updateData.issuePhoto = JSON.stringify(body.photos ?? []);
  }

  if (body.claim !== undefined) {
    updateData.isClaim = body.claim === 'Yes' || body.claim === true;
  }

  if (body.status !== undefined) {
    updateData.status = toQualityRecordStatus(
      normalizeOptionalInspectionIssueString(body.status),
    );
  }

  return updateData;
}

export function buildInspectionIssueUpsertPayload(
  item: InspectionIssueImportItem,
  serialNumber: number,
) {
  const ncNumber =
    normalizeOptionalInspectionIssueString(item.nonConformanceNumber) ??
    normalizeOptionalInspectionIssueString(item.ncNumber);
  if (!ncNumber) {
    return null;
  }

  const quantity = normalizeOptionalInspectionIssueNumber(item.quantity);
  const status = toQualityRecordStatus(
    normalizeOptionalInspectionIssueString(item.status),
  );

  return {
    create: {
      id: createInspectionIssueId(),
      serialNumber,
      date: new Date(),
      status,
      partName:
        normalizeOptionalInspectionIssueString(item.partName) ?? '未知零件',
      description:
        normalizeOptionalInspectionIssueString(item.description) ?? '',
      quantity: quantity ?? 0,
      projectName:
        normalizeOptionalInspectionIssueString(item.projectName) ?? '',
      division: normalizeOptionalInspectionIssueString(item.division) ?? '',
      responsibleDepartment:
        normalizeOptionalInspectionIssueString(item.responsibleDepartment) ??
        '质量部',
      responsibleWelder:
        normalizeOptionalInspectionIssueString(item.responsibleWelder) ?? null,
      nonConformanceNumber: ncNumber,
      workOrderNumber:
        normalizeOptionalInspectionIssueString(item.workOrderNumber) ?? null,
    },
    update: {
      partName: normalizeOptionalInspectionIssueString(item.partName),
      description: normalizeOptionalInspectionIssueString(item.description),
      quantity,
      projectName: normalizeOptionalInspectionIssueString(item.projectName),
      responsibleDepartment: normalizeOptionalInspectionIssueString(
        item.responsibleDepartment,
      ),
      responsibleWelder: normalizeOptionalInspectionIssueString(
        item.responsibleWelder,
      ),
      status,
    },
    where: { nonConformanceNumber: ncNumber },
  };
}

export { type InspectionIssueDateMode } from '@qgs/domain';
