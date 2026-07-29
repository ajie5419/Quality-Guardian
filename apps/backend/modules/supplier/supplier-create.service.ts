import type { Prisma, suppliers } from '@prisma/client';

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

type SupplierCreateClient = Pick<Prisma.TransactionClient, 'suppliers'>;

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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function restoreDeletedSupplier(
  name: string,
  payload: Record<string, unknown>,
  originalError: Error,
  client: SupplierCreateClient,
): Promise<SupplierCreateOutcome> {
  const existing = await client.suppliers.findUnique({ where: { name } });
  if (!existing) throw originalError;
  if (!existing.isDeleted) throw supplierNameConflict();

  const restored = await client.suppliers.updateMany({
    where: { id: existing.id, isDeleted: true, name },
    data: {
      ...(await buildSupplierUpdateDataWithCanonical(payload)),
      isDeleted: false,
    },
  });
  if (restored.count === 0) {
    const current = await client.suppliers.findUnique({ where: { name } });
    if (current && !current.isDeleted) throw supplierNameConflict();
    throw originalError;
  }

  return {
    action: 'RESTORE',
    supplier: await client.suppliers.findUniqueOrThrow({
      where: { id: existing.id },
    }),
  };
}

export async function createSupplierRecord(
  payload: Record<string, unknown>,
  client: SupplierCreateClient = prisma,
): Promise<null | SupplierCreateOutcome> {
  const createData = await buildSupplierCreateDataWithCanonical(payload);
  if (!createData) return null;

  try {
    return {
      action: 'CREATE',
      supplier: await client.suppliers.create({ data: createData }),
    };
  } catch (error: unknown) {
    const originalError = toError(error);
    if (!isSupplierNameUniqueConflict(error)) {
      logger.error(originalError, 'createSupplierRecord failed');
      throw originalError;
    }
    return restoreDeletedSupplier(
      createData.name,
      payload,
      originalError,
      client,
    );
  }
}
