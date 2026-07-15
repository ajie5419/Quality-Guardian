import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  createSupplierRecord,
  SUPPLIER_NAME_CONFLICT,
} from './supplier-create.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    suppliers: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/governed-write', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('~/utils/governed-write')>();
  return {
    ...actual,
    buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  };
});

function supplier(isDeleted = false) {
  return {
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    id: 'supplier-existing',
    isDeleted,
    name: 'Supplier A',
    updatedAt: new Date('2026-07-15T00:00:00.000Z'),
  };
}

function nameConflict() {
  return Object.assign(new Error('suppliers_name_key'), {
    code: 'P2002',
    meta: { target: ['name'] },
  });
}

describe('createSupplierRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new supplier without a preflight lookup', async () => {
    const created = supplier();
    (prisma.suppliers.create as any).mockResolvedValue(created);

    const result = await createSupplierRecord({ name: ' Supplier A ' });

    expect(result).toEqual({ action: 'CREATE', supplier: created });
    expect(prisma.suppliers.findUnique).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted supplier and preserves its ID', async () => {
    const deleted = supplier(true);
    const restored = supplier(false);
    (prisma.suppliers.create as any).mockRejectedValue(nameConflict());
    (prisma.suppliers.findUnique as any).mockResolvedValue(deleted);
    (prisma.suppliers.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.suppliers.findUniqueOrThrow as any).mockResolvedValue(restored);

    const result = await createSupplierRecord({ name: ' Supplier A ' });

    expect(prisma.suppliers.updateMany).toHaveBeenCalledWith({
      where: { id: deleted.id, isDeleted: true, name: 'Supplier A' },
      data: expect.objectContaining({
        isDeleted: false,
        name: 'Supplier A',
      }),
    });
    expect(result).toEqual({ action: 'RESTORE', supplier: restored });
  });

  it('returns a domain conflict for an active duplicate', async () => {
    (prisma.suppliers.create as any).mockRejectedValue(nameConflict());
    (prisma.suppliers.findUnique as any).mockResolvedValue(supplier());

    const result = createSupplierRecord({ name: 'Supplier A' });

    await expect(result).rejects.toMatchObject({
      code: SUPPLIER_NAME_CONFLICT,
      httpStatus: 409,
    } satisfies Partial<BusinessError>);
  });

  it('returns a domain conflict to the concurrent restore loser', async () => {
    const deleted = supplier(true);
    (prisma.suppliers.create as any).mockRejectedValue(nameConflict());
    (prisma.suppliers.findUnique as any)
      .mockResolvedValueOnce(deleted)
      .mockResolvedValueOnce(supplier());
    (prisma.suppliers.updateMany as any).mockResolvedValue({ count: 0 });

    await expect(
      createSupplierRecord({ name: 'Supplier A' }),
    ).rejects.toMatchObject({ code: SUPPLIER_NAME_CONFLICT });
    expect(prisma.suppliers.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not misclassify a non-name unique collision', async () => {
    const collision = Object.assign(
      new Error('create supplier with data.name failed on suppliers_pkey'),
      {
        code: 'P2002',
        meta: { target: ['id'] },
      },
    );
    (prisma.suppliers.create as any).mockRejectedValue(collision);

    await expect(createSupplierRecord({ name: 'Supplier A' })).rejects.toBe(
      collision,
    );
    expect(prisma.suppliers.findUnique).not.toHaveBeenCalled();
  });

  it('normalizes non-Error failures before rethrowing', async () => {
    (prisma.suppliers.create as any).mockRejectedValue('database unavailable');

    await expect(createSupplierRecord({ name: 'Supplier A' })).rejects.toEqual(
      new Error('database unavailable'),
    );
    expect(prisma.suppliers.findUnique).not.toHaveBeenCalled();
  });
});
