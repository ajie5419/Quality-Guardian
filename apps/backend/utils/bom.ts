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
  material?: unknown;
  partName?: unknown;
  partNumber?: unknown;
  quantity?: unknown;
  remarks?: unknown;
  unit?: unknown;
}

export function buildProjectBomMutableData(item: ProjectBomInput) {
  return {
    material: normalizeBomText(item.material) || null,
    part_name: normalizeBomText(item.partName) || DEFAULT_BOM_PART_NAME,
    part_number: normalizeBomText(item.partNumber) || null,
    quantity: parseBomQuantity(item.quantity, 1),
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
  material: null | string;
  part_name: string;
  part_number: null | string;
  quantity: number;
  remarks: null | string;
  unit: string;
  work_order_number: string;
}) {
  return {
    id: item.id,
    material: item.material,
    parentId: item.work_order_number,
    partName: item.part_name,
    partNumber: item.part_number,
    quantity: item.quantity,
    remarks: item.remarks,
    unit: item.unit,
  };
}
