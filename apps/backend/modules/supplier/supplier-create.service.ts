import type { suppliers } from '@prisma/client';

import {
  buildSupplierCreateDataWithCanonical,
  buildSupplierUpdateDataWithCanonical,
} from '~/modules/supplier/supplier-query';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

export const SUPPLIER_NAME_CONFLICT = 'SUPPLIER_NAME_CONFLICT';

const logger = createModuleLogger('supplier-create');

export interface SupplierCreateOutcome {
  action: 'CREATE' | 'RESTORE';
  supplier: suppliers;
}

function isSupplierNameUniqueConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const message = String((error as { message?: string })?.message || '');
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targets = new Set(
    (Array.isArray(target) ? target : [target])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.replaceAll(/[`'"]+/g, '').trim()),
  );
  return (
    targets.has('name') ||
    targets.has('suppliers_name_key') ||
    message.includes('suppliers_name_key') ||
    /unique constraint failed on the fields?: \(`?name`?\)/i.test(message)
  );
}

function supplierNameConflict(): BusinessError {
  return new BusinessError(SUPPLIER_NAME_CONFLICT, '供应商名称已存在', 409);
}

async function restoreDeletedSupplier(
  name: string,
  payload: Record<string, unknown>,
  originalError: unknown,
): Promise<SupplierCreateOutcome> {
  const existing = await prisma.suppliers.findUnique({ where: { name } });
  if (!existing) throw originalError;
  if (!existing.isDeleted) throw supplierNameConflict();

  const restored = await prisma.suppliers.updateMany({
    where: { id: existing.id, isDeleted: true, name },
    data: {
      ...(await buildSupplierUpdateDataWithCanonical(payload)),
      isDeleted: false,
    },
  });
  if (restored.count === 0) {
    const current = await prisma.suppliers.findUnique({ where: { name } });
    if (current && !current.isDeleted) throw supplierNameConflict();
    throw originalError;
  }

  return {
    action: 'RESTORE',
    supplier: await prisma.suppliers.findUniqueOrThrow({
      where: { id: existing.id },
    }),
  };
}

export async function createSupplierRecord(
  payload: Record<string, unknown>,
): Promise<null | SupplierCreateOutcome> {
  const createData = await buildSupplierCreateDataWithCanonical(payload);
  if (!createData) return null;

  try {
    return {
      action: 'CREATE',
      supplier: await prisma.suppliers.create({ data: createData }),
    };
  } catch (error: unknown) {
    if (!isSupplierNameUniqueConflict(error)) {
      logger.error(error, 'createSupplierRecord failed');
      throw error;
    }
    return restoreDeletedSupplier(createData.name, payload, error);
  }
}
