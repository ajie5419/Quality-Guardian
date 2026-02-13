import { mapAfterSalesStatus } from '~/utils/after-sales-status';

function normalizeString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function normalizeDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeNumber(
  value: unknown,
  options: { fallback?: number; integer?: boolean } = {},
): number | undefined {
  if (value === undefined || value === null || value === '') {
    return options.fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return options.fallback;
  }
  if (options.integer) {
    return Math.trunc(parsed);
  }
  return parsed;
}

function normalizePhotos(value: unknown): null | string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

type AfterSalesBody = Record<string, unknown>;

export function buildAfterSalesCreateData(
  body: AfterSalesBody,
  options: {
    defaultWorkOrderNumber: string;
    id: string;
    serialNumber: number;
  },
) {
  const workOrderNumber =
    normalizeString(body.workOrderNumber) || options.defaultWorkOrderNumber;
  const materialCost = normalizeNumber(body.materialCost, { fallback: 0 }) || 0;
  const laborTravelCost =
    normalizeNumber(body.laborTravelCost, { fallback: 0 }) || 0;

  return {
    id: options.id,
    serialNumber: options.serialNumber,
    occurDate: normalizeDate(body.issueDate ?? body.occurDate) || new Date(),
    claimStatus: mapAfterSalesStatus(normalizeString(body.status)),
    projectName: normalizeString(body.projectName) || '',
    customerName: normalizeString(body.customerName),
    workOrderNumber,
    issueDescription: normalizeString(body.issueDescription),
    quantity:
      normalizeNumber(body.quantity, { fallback: 1, integer: true }) || 1,
    location: normalizeString(body.location),
    productType: normalizeString(body.productType),
    productSubtype: normalizeString(body.productSubtype),
    factoryDate: normalizeDate(body.factoryDate) || null,
    closeDate: normalizeDate(body.closeDate) || null,
    warrantyStatus: normalizeString(body.warrantyStatus),
    respDept: normalizeString(body.responsibleDept),
    feedbackDept: normalizeString(body.responsibleDept),
    solution: normalizeString(body.resolutionPlan),
    handler: normalizeString(body.handler),
    materialCost,
    laborTravelCost,
    qualityLoss: materialCost + laborTravelCost,
    defectType: normalizeString(body.defectType),
    defectSubtype: normalizeString(body.defectSubtype),
    severity: normalizeString(body.severity),
    runningHours: normalizeNumber(body.runningHours),
    division: normalizeString(body.division),
    partName: normalizeString(body.partName),
    supplierBrand: normalizeString(body.supplierBrand) || null,
    isClaim: Boolean(body.isClaim),
    photos: normalizePhotos(body.photos) ?? null,
    isDeleted: false,
    updatedAt: new Date(),
  };
}

export function buildAfterSalesUpdateData(body: AfterSalesBody): {
  costsChanged: boolean;
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  const occurDate = normalizeDate(body.issueDate);
  if (occurDate) {
    data.occurDate = occurDate;
  }

  const responsibleDept = normalizeString(body.responsibleDept);
  if (responsibleDept !== undefined) {
    data.respDept = responsibleDept;
    data.feedbackDept = responsibleDept;
  }

  const solution = normalizeString(body.resolutionPlan);
  if (solution !== undefined) {
    data.solution = solution;
  }

  const claimStatus = normalizeString(body.status);
  if (claimStatus !== undefined) {
    data.claimStatus = mapAfterSalesStatus(claimStatus);
  }

  const stringFields = [
    'workOrderNumber',
    'projectName',
    'customerName',
    'location',
    'productType',
    'productSubtype',
    'warrantyStatus',
    'issueDescription',
    'handler',
    'defectType',
    'defectSubtype',
    'severity',
    'division',
    'supplierBrand',
    'partName',
  ];
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      data[field] = normalizeString(body[field]) || null;
    }
  }

  if (body.isClaim !== undefined) {
    data.isClaim = Boolean(body.isClaim);
  }

  if (body.photos !== undefined) {
    data.photos = normalizePhotos(body.photos);
  }

  const quantity = normalizeNumber(body.quantity, { integer: true });
  if (quantity !== undefined) {
    data.quantity = quantity;
  }

  const runningHours = normalizeNumber(body.runningHours);
  if (runningHours !== undefined) {
    data.runningHours = runningHours;
  }

  const materialCost = normalizeNumber(body.materialCost);
  if (materialCost !== undefined) {
    data.materialCost = materialCost;
  }

  const laborTravelCost = normalizeNumber(body.laborTravelCost);
  if (laborTravelCost !== undefined) {
    data.laborTravelCost = laborTravelCost;
  }

  const factoryDate = normalizeDate(body.factoryDate);
  if (factoryDate) {
    data.factoryDate = factoryDate;
  }

  const closeDate = normalizeDate(body.closeDate);
  if (closeDate) {
    data.closeDate = closeDate;
  }

  return {
    costsChanged: materialCost !== undefined || laborTravelCost !== undefined,
    data,
  };
}
