import { beforeEach, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { MetrologyDeleteService } from './metrology-delete.service';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(async (work) => work({ measuring_instruments: mocks })),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([{ id: 'a', borrowStatus: 'AVAILABLE' }]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

it.each(['BORROWED', 'RETURN_PENDING'])(
  'rejects deleting a %s instrument before writing',
  async (borrowStatus) => {
    mocks.findMany.mockResolvedValue([{ id: 'a', borrowStatus }]);
    await expect(MetrologyDeleteService.deleteById('a')).rejects.toMatchObject({
      httpStatus: 409,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  },
);

it('rejects a mixed batch atomically without deleting the available member', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 'a', borrowStatus: 'AVAILABLE' },
    { id: 'b', borrowStatus: 'BORROWED' },
  ]);
  await expect(
    MetrologyDeleteService.batchDelete(['a', 'b']),
  ).rejects.toMatchObject({ httpStatus: 409 });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it('rejects a return-pending mixed batch without writing either member', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 'a', borrowStatus: 'AVAILABLE' },
    { id: 'b', borrowStatus: 'RETURN_PENDING' },
  ]);
  await expect(
    MetrologyDeleteService.batchDelete(['a', 'b']),
  ).rejects.toMatchObject({ httpStatus: 409 });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it('throws inside the transaction when only part of a mixed batch wins CAS', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 'a', borrowStatus: 'AVAILABLE' },
    { id: 'b', borrowStatus: 'AVAILABLE' },
  ]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  await expect(
    MetrologyDeleteService.batchDelete(['a', 'b']),
  ).rejects.toMatchObject({ httpStatus: 409 });
  expect(prisma.$transaction).toHaveBeenCalledOnce();
  expect(mocks.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['a', 'b'] },
        isDeleted: false,
        borrowStatus: 'AVAILABLE',
      }),
    }),
  );
});

it('soft deletes a fully available batch without changing missing-id semantics', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 'a', borrowStatus: 'AVAILABLE' },
    { id: 'b', borrowStatus: 'AVAILABLE' },
  ]);
  mocks.updateMany.mockResolvedValue({ count: 2 });
  await expect(
    MetrologyDeleteService.batchDelete(['a', 'b'], 'operator'),
  ).resolves.toEqual({ count: 2 });
});

it.each(['single', 'batch'])(
  'rolls back a raced %s delete when borrow claims after the read',
  async (kind) => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const result =
      kind === 'single'
        ? MetrologyDeleteService.deleteById('a')
        : MetrologyDeleteService.batchDelete(['a']);
    await expect(result).rejects.toMatchObject({ httpStatus: 409 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          borrowStatus: 'AVAILABLE',
          borrowRecords: {
            none: {
              isDeleted: false,
              status: { in: ['BORROWED', 'OVERDUE', 'RETURN_PENDING'] },
            },
          },
        }),
      }),
    );
  },
);

it('soft deletes an available instrument and preserves its audit identity', async () => {
  await expect(
    MetrologyDeleteService.deleteById('a', 'operator'),
  ).resolves.toMatchObject({ id: 'a', isDeleted: true });
  expect(mocks.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ isDeleted: true, updatedBy: 'operator' }),
    }),
  );
});

it('deduplicates through the row query and preserves batch missing-id behavior', async () => {
  await expect(
    MetrologyDeleteService.batchDelete(['a', 'a', 'missing']),
  ).resolves.toEqual({ count: 1 });
});

it('returns not-found for a missing single target', async () => {
  mocks.findMany.mockResolvedValue([]);
  await expect(
    MetrologyDeleteService.deleteById('missing'),
  ).rejects.toMatchObject({ httpStatus: 404 });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});
