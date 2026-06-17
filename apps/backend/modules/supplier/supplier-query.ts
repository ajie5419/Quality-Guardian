import type { SupplierQueryParams } from '~/modules/supplier/supplier.service';

import {
  buildSupplierCreateData as buildSupplierCreateDataRule,
  buildSupplierUpdateData as buildSupplierUpdateDataRule,
  buildSupplierUpsertPayload as buildSupplierUpsertPayloadRule,
  parseSupplierListQuery as parseSupplierListQueryRule,
} from '@qgs/shared';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

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
} from '@qgs/shared';

interface SupplierImportItem {
  address?: unknown;
  admissionDocuments?: unknown;
  brand?: unknown;
  buyer?: unknown;
  category?: unknown;
  contact?: unknown;
  email?: unknown;
  manufacturerNature?: unknown;
  name?: unknown;
  origin?: unknown;
  outsourcingMode?: unknown;
  phone?: unknown;
  project?: unknown;
  productName?: unknown;
  recognizedAt?: unknown;
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
  const data = buildSupplierCreateDataRule(input);
  if (!data) return data;
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable('suppliers', data),
  };
}

export async function buildSupplierCreateDataWithCanonical(
  input: SupplierImportItem,
) {
  const data = buildSupplierCreateData(input);
  if (!data) return data;
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'suppliers',
    data,
  );
  return {
    ...data,
    ...governedCanonicalIds,
  };
}

export function buildSupplierUpdateData(input: SupplierImportItem) {
  const data = buildSupplierUpdateDataRule(input);
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable('suppliers', data),
  };
}

export async function buildSupplierUpdateDataWithCanonical(
  input: SupplierImportItem,
) {
  const data = buildSupplierUpdateData(input);
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'suppliers',
    data,
  );
  return {
    ...data,
    ...governedCanonicalIds,
  };
}

export function parseSupplierListQuery(
  query: Record<string, unknown>,
): SupplierQueryParams {
  return parseSupplierListQueryRule(query);
}
