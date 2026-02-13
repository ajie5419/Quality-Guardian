import { nanoid } from 'nanoid';

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
