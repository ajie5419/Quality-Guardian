import type { SupplierQueryParams } from '~/services/supplier.service';

import { nanoid } from 'nanoid';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
const DEFAULT_SUPPLIER_CATEGORY = 'Supplier';

function parsePositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

export function createSupplierId(): string {
  return `SUP-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export function normalizeSupplierString(value: unknown): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');

  if (
    !normalized ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === '[object Object]'
  ) {
    return undefined;
  }

  return normalized;
}

export function normalizeSupplierName(value: unknown): null | string {
  return normalizeSupplierString(value) ?? null;
}

export function normalizeSupplierScore(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

export function normalizeSupplierStatus(value: unknown): string {
  return normalizeSupplierString(value) ?? 'Qualified';
}

interface SupplierImportItem {
  address?: unknown;
  brand?: unknown;
  buyer?: unknown;
  category?: unknown;
  contact?: unknown;
  email?: unknown;
  name?: unknown;
  origin?: unknown;
  phone?: unknown;
  project?: unknown;
  productName?: unknown;
  score2025?: unknown;
  status?: unknown;
}

interface BuildSupplierUpsertOptions {
  category?: unknown;
  defaultCategory?: string;
}

export function buildSupplierUpsertPayload(
  item: SupplierImportItem,
  options: BuildSupplierUpsertOptions = {},
) {
  const name = normalizeSupplierName(item.name);
  if (!name) {
    return null;
  }

  const category =
    normalizeSupplierString(options.category) ??
    normalizeSupplierString(item.category) ??
    options.defaultCategory;

  return {
    create: {
      id: createSupplierId(),
      name,
      brand: normalizeSupplierString(item.brand),
      productName: normalizeSupplierString(item.productName),
      buyer: normalizeSupplierString(item.buyer),
      category: category ?? DEFAULT_SUPPLIER_CATEGORY,
      status: normalizeSupplierStatus(item.status),
    },
    update: {
      brand: normalizeSupplierString(item.brand),
      productName: normalizeSupplierString(item.productName),
      buyer: normalizeSupplierString(item.buyer),
      category,
      isDeleted: false,
      updatedAt: new Date(),
    },
    where: { name },
  };
}

function buildSupplierMutableData(input: SupplierImportItem) {
  return {
    category: normalizeSupplierString(input.category),
    productName: normalizeSupplierString(input.productName),
    brand: normalizeSupplierString(input.brand),
    origin: normalizeSupplierString(input.origin),
    project: normalizeSupplierString(input.project),
    buyer: normalizeSupplierString(input.buyer),
    score2025: normalizeSupplierScore(input.score2025, 0),
    status: normalizeSupplierStatus(input.status),
    contact: normalizeSupplierString(input.contact),
    phone: normalizeSupplierString(input.phone),
    email: normalizeSupplierString(input.email),
    address: normalizeSupplierString(input.address),
  };
}

export function buildSupplierCreateData(input: SupplierImportItem) {
  const name = normalizeSupplierName(input.name);
  if (!name) {
    return null;
  }

  return {
    id: createSupplierId(),
    name,
    ...buildSupplierMutableData(input),
    isDeleted: false,
  };
}

export function buildSupplierUpdateData(input: SupplierImportItem) {
  return {
    name: normalizeSupplierString(input.name),
    ...buildSupplierMutableData(input),
    updatedAt: new Date(),
  };
}

export function parseSupplierListQuery(
  query: Record<string, unknown>,
): SupplierQueryParams {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const sortOrderRaw = normalizeSupplierString(query.sortOrder)?.toLowerCase();
  const sortOrder =
    sortOrderRaw === 'asc' || sortOrderRaw === 'desc'
      ? sortOrderRaw
      : undefined;

  return {
    category: normalizeSupplierString(query.category),
    keyword:
      normalizeSupplierString(query.keyword) ||
      normalizeSupplierString(query.name),
    page,
    pageSize,
    sortBy: normalizeSupplierString(query.sortBy),
    sortOrder,
    status: normalizeSupplierString(query.status),
  };
}
