export function normalizeInspectionIssueString(
  value: unknown,
): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');
  return normalized || undefined;
}

export function normalizeOptionalInspectionIssueString(
  value: unknown,
): string | undefined {
  const normalized = normalizeInspectionIssueString(value);
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

export function normalizeOptionalInspectionIssueNumber(
  value: unknown,
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

export function normalizeOptionalInspectionIssueDate(
  value: unknown,
): Date | undefined {
  const normalized = normalizeOptionalInspectionIssueString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

// Ownership bypass must never be inferred from arbitrary role name fragments.
const INSPECTION_ISSUE_ADMIN_ROLES = new Set([
  'admin',
  'super',
  'super_admin',
  'system_admin',
]);

export function hasInspectionIssueAdminAccess(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => {
    const normalizedRole = normalizeOptionalInspectionIssueString(role)
      ?.toLowerCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
    return normalizedRole
      ? INSPECTION_ISSUE_ADMIN_ROLES.has(normalizedRole)
      : false;
  });
}

export function shouldRestrictInspectionIssueRead(roles: unknown): boolean {
  return !hasInspectionIssueAdminAccess(roles);
}

export function hasInspectionIssueWriteAccess(params: {
  createdBy: null | string;
  roles?: unknown;
  userId: unknown;
}): boolean {
  if (hasInspectionIssueAdminAccess(params.roles)) return true;
  const userId = String(params.userId ?? '').trim();
  return Boolean(userId && params.createdBy === userId);
}

export function createInspectionIssueId(now: Date, idPart: string): string {
  return `ISS-${now.getFullYear()}-${idPart.toUpperCase()}`;
}

export interface LinkedInspectionPartView {
  category: string;
  level1Component: null | string;
  level2Component: null | string;
  materialName: null | string;
  processName: null | string;
}

export function deriveIssuePartNameFromInspection(
  inspection?: LinkedInspectionPartView,
): string | undefined {
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

export interface LinkedInspectionProcessView {
  category: string;
  incomingType: null | string;
  processName: null | string;
}

export function deriveIssueProcessNameFromInspection(
  inspection?: LinkedInspectionProcessView,
): string | undefined {
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

export interface InspectionIssueCreateDataInput {
  body: Record<string, unknown>;
  createdBy?: string;
  inspection?:
    | (LinkedInspectionPartView &
        LinkedInspectionProcessView & {
          category?: null | string;
          id?: string;
          projectName?: null | string;
          quantity?: null | number;
          supplierId?: null | string;
          supplierName?: null | string;
          teamId?: null | string;
          work_order?: null | {
            division?: null | string;
          };
          workOrderNumber?: null | string;
        })
    | null;
  inspectorUsername?: string;
  mapStatus: (value: null | string | undefined) => string;
  now?: Date;
  serialNumber: number;
  uuid: string;
}

export function buildInspectionIssueCreateDataCore(
  input: InspectionIssueCreateDataInput,
) {
  const issueDate =
    normalizeOptionalInspectionIssueDate(input.body.reportDate) ??
    input.now ??
    new Date();
  const linkedInspection = input.inspection ?? undefined;
  const workOrderNumber =
    linkedInspection?.workOrderNumber ||
    normalizeOptionalInspectionIssueString(input.body.workOrderNumber);
  const projectName =
    linkedInspection?.projectName ||
    normalizeOptionalInspectionIssueString(input.body.projectName);
  const processName =
    deriveIssueProcessNameFromInspection(linkedInspection || undefined) ||
    normalizeOptionalInspectionIssueString(input.body.processName);
  const partName =
    normalizeOptionalInspectionIssueString(input.body.partName) ||
    deriveIssuePartNameFromInspection(linkedInspection || undefined) ||
    'Unknown';
  const supplierId =
    normalizeOptionalInspectionIssueString(input.body.supplierId) ||
    linkedInspection?.supplierId ||
    undefined;
  const supplierName =
    normalizeOptionalInspectionIssueString(input.body.supplierName) ||
    (linkedInspection?.category === 'INCOMING'
      ? linkedInspection.supplierName || undefined
      : undefined);
  const division =
    linkedInspection?.work_order?.division ||
    normalizeOptionalInspectionIssueString(input.body.division);
  const quantity =
    normalizeOptionalInspectionIssueNumber(input.body.quantity) ??
    linkedInspection?.quantity ??
    1;

  return {
    id: input.uuid,
    serialNumber: input.serialNumber,
    date: issueDate,
    inspection: linkedInspection
      ? {
          connect: {
            id: linkedInspection.id,
          },
        }
      : undefined,
    status: input.mapStatus(
      normalizeOptionalInspectionIssueString(input.body.status),
    ),
    nonConformanceNumber:
      normalizeOptionalInspectionIssueString(input.body.ncNumber) ?? null,
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
    defectType: normalizeOptionalInspectionIssueString(input.body.defectType),
    defectSubtype: normalizeOptionalInspectionIssueString(
      input.body.defectSubtype,
    ),
    severity:
      normalizeOptionalInspectionIssueString(input.body.severity) ?? 'Minor',
    rootCause: normalizeOptionalInspectionIssueString(input.body.rootCause),
    solution: normalizeOptionalInspectionIssueString(input.body.solution),
    description: normalizeOptionalInspectionIssueString(input.body.description),
    quantity,
    lossAmount:
      normalizeOptionalInspectionIssueNumber(input.body.lossAmount) ?? 0,
    responsibleDepartment:
      normalizeOptionalInspectionIssueString(
        input.body.responsibleDepartment,
      ) ?? 'Unknown',
    responsibleWelder:
      normalizeOptionalInspectionIssueString(input.body.responsibleWelder) ??
      null,
    supplierName: supplierName ?? null,
    supplierId: supplierId ?? null,
    category:
      linkedInspection?.category ??
      normalizeOptionalInspectionIssueString(input.body.category),
    users_quality_records_inspectorTousers: input.inspectorUsername
      ? { connect: { username: input.inspectorUsername } }
      : undefined,
    isClaim: input.body.claim === 'Yes' || input.body.claim === true,
    issuePhoto:
      input.body.photos === undefined
        ? '[]'
        : JSON.stringify(input.body.photos ?? []),
    isDeleted: false,
    createdBy: input.createdBy ?? null,
    updatedAt: input.now ?? new Date(),
  };
}

export function buildInspectionIssueUpdateDataCore(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
  mapStatus: (value: null | string | undefined) => string,
  now = new Date(),
) {
  const updateData: Record<string, unknown> = {
    updatedAt: now,
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
    'supplierId',
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
    updateData.status = mapStatus(
      normalizeOptionalInspectionIssueString(body.status),
    );
  }

  return updateData;
}

export interface InspectionIssueUpsertPayloadItem {
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

export function buildInspectionIssueUpsertPayloadCore(
  item: InspectionIssueUpsertPayloadItem,
  serialNumber: number,
  mapStatus: (value: null | string | undefined) => string,
  createId: () => string,
  options: { createdBy?: string } = {},
) {
  const ncNumber =
    normalizeOptionalInspectionIssueString(item.nonConformanceNumber) ??
    normalizeOptionalInspectionIssueString(item.ncNumber);
  if (!ncNumber) {
    return null;
  }

  const quantity = normalizeOptionalInspectionIssueNumber(item.quantity);
  const status = mapStatus(normalizeOptionalInspectionIssueString(item.status));

  return {
    create: {
      id: createId(),
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
      createdBy: options.createdBy ?? null,
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
