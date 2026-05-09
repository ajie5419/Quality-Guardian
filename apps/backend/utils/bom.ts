import { nanoid } from 'nanoid';

const DEFAULT_BOM_PART_NAME = '未命名部件';
const DEFAULT_BOM_PROJECT_STATUS = 'active';
const DEFAULT_BOM_PROJECT_VERSION = 'V1.0';
const DEFAULT_BOM_UNIT = 'PCS';

export function createBomItemId(): string {
  return `BOM-${nanoid(6).toUpperCase()}`;
}

export function createBomProjectId(): string {
  return `BOM-PROJ-${nanoid(6).toUpperCase()}`;
}

export function parseBomQuantity(value: unknown, defaultValue = 1): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(0, Math.trunc(parsed));
}

export function normalizeBomText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function normalizeBomProjectStatus(value: unknown): string {
  return normalizeBomText(value) || DEFAULT_BOM_PROJECT_STATUS;
}

export function normalizeBomProjectVersion(value: unknown): string {
  return normalizeBomText(value) || DEFAULT_BOM_PROJECT_VERSION;
}

interface ProjectBomInput {
  partName?: unknown;
  partNumber?: unknown;
  quantity?: unknown;
  requiredProcesses?: unknown;
  remarks?: unknown;
  unit?: unknown;
}

export interface BomInspectionProgress {
  completed: boolean;
  completedQuantity: number;
  processName: string;
  requiredQuantity: number;
  remainingQuantity: number;
}

function normalizeBomProcessList(value: unknown): string[] {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === 'string') {
    values = value.startsWith('[')
      ? tryParseJsonArray(value)
      : value.split(/[、,，;；\n]/);
  }

  return [
    ...new Set(values.map((item) => normalizeBomText(item)).filter(Boolean)),
  ];
}

function tryParseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeBomRequiredProcesses(value: unknown): null | string {
  const processes = normalizeBomProcessList(value);
  return processes.length > 0 ? JSON.stringify(processes) : null;
}

export function parseBomRequiredProcesses(value: unknown): string[] {
  return normalizeBomProcessList(value);
}

export function buildProjectBomMutableData(item: ProjectBomInput) {
  return {
    part_name: normalizeBomText(item.partName) || DEFAULT_BOM_PART_NAME,
    part_number: normalizeBomText(item.partNumber) || null,
    quantity: parseBomQuantity(item.quantity, 1),
    required_processes: serializeBomRequiredProcesses(item.requiredProcesses),
    remarks: normalizeBomText(item.remarks) || null,
    unit: normalizeBomText(item.unit) || DEFAULT_BOM_UNIT,
    updated_at: new Date(),
  };
}

export function buildProjectBomCreateData(
  workOrderNumber: string,
  item: ProjectBomInput,
) {
  return {
    id: createBomItemId(),
    work_order_number: workOrderNumber,
    ...buildProjectBomMutableData(item),
  };
}

export function mapProjectBomItem(item: {
  id: string;
  inspectionProgress?: BomInspectionProgress[];
  part_name: string;
  part_number: null | string;
  quantity: number;
  remarks: null | string;
  required_processes?: null | string;
  unit: string;
  work_order_number: string;
}) {
  return {
    id: item.id,
    inspectionProgress: item.inspectionProgress || [],
    parentId: item.work_order_number,
    partName: item.part_name,
    partNumber: item.part_number,
    quantity: item.quantity,
    requiredProcesses: parseBomRequiredProcesses(item.required_processes),
    remarks: item.remarks,
    unit: item.unit,
  };
}

export function groupBomItemsByWorkOrder<
  T extends { work_order_number: string },
>(items: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const item of items) {
    const workOrderNumber = item.work_order_number;
    if (!grouped[workOrderNumber]) {
      grouped[workOrderNumber] = [];
    }
    grouped[workOrderNumber].push(item);
  }
  return grouped;
}

interface BomTreeProjectInput {
  id: string;
  projectName: string;
  status: string;
  workOrderNumber: string;
  work_order?: null | {
    customerName?: null | string;
    deliveryDate?: Date | null;
    division?: null | string;
    projectName?: null | string;
    quantity?: null | number;
  };
}

export function mapBomTreeProjectNode(
  project: BomTreeProjectInput,
  projectItems: Array<{
    id: string;
    inspectionProgress?: BomInspectionProgress[];
    part_name: string;
    part_number: null | string;
    quantity: number;
    remarks: null | string;
    required_processes?: null | string;
    unit: string;
    work_order_number: string;
  }>,
) {
  return {
    children: projectItems.map((item) => ({
      ...mapProjectBomItem(item),
      parentId: project.id,
      projectName: project.projectName,
      type: 'item',
      workOrderNumber: project.workOrderNumber,
    })),
    customerName: project.work_order?.customerName || '',
    deliveryDate: project.work_order?.deliveryDate,
    id: project.id,
    itemCount: projectItems.length,
    name: project.projectName,
    productModel: project.work_order?.division || '',
    productName: project.work_order?.projectName || '',
    projectName: project.projectName,
    quantity: project.work_order?.quantity,
    status: normalizeBomProjectStatus(project.status),
    type: 'project',
    version: normalizeBomProjectVersion(undefined),
    workOrderNumber: project.workOrderNumber,
  };
}
