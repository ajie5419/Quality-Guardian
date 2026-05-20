import type { SupplierQueryParams } from '~/services/supplier.service';

import {
  buildSupplierCreateData as buildSupplierCreateDataRule,
  buildSupplierUpdateData as buildSupplierUpdateDataRule,
  buildSupplierUpsertPayload as buildSupplierUpsertPayloadRule,
  parseSupplierListQuery as parseSupplierListQueryRule,
} from '@qgs/domain';

export {
  createSupplierId,
  DEFAULT_OUTSOURCING_MODE,
  IN_HOUSE_OUTSOURCING_MODE,
  isOutsourcingCategory,
  normalizeOutsourcingMode,
  normalizeSupplierName,
  normalizeSupplierScore,
  normalizeSupplierStatus,
  normalizeSupplierString,
  OUTSOURCING_CATEGORY,
  OUTSOURCING_MODES,
} from '@qgs/domain';

interface SupplierImportItem {
  address?: unknown;
  brand?: unknown;
  buyer?: unknown;
  category?: unknown;
  contact?: unknown;
  email?: unknown;
  name?: unknown;
  origin?: unknown;
  outsourcingMode?: unknown;
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
  return buildSupplierUpsertPayloadRule(item, options);
}

export function buildSupplierCreateData(input: SupplierImportItem) {
  return buildSupplierCreateDataRule(input);
}

export function buildSupplierUpdateData(input: SupplierImportItem) {
  return buildSupplierUpdateDataRule(input);
}

export function parseSupplierListQuery(
  query: Record<string, unknown>,
): SupplierQueryParams {
  return parseSupplierListQueryRule(query);
}
