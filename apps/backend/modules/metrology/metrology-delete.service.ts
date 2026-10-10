import { ErrorCode } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  ACTIVE_BORROW_RECORD_STATUSES,
  INSTRUMENT_BORROW_STATUS,
} from './borrow/metrology-borrow-state';

/**
 * Soft deletion competes for the same instrument row as borrow CAS.
 * A mixed batch is atomic: a busy row or raced claim rolls back all deletes.
 */
async function deleteAvailable(
  ids: string[],
  operator?: string,
  single = false,
) {
  return prisma.$transaction(async (tx) => {
    const instruments = await tx.measuring_instruments.findMany({
      where: { id: { in: ids }, isDeleted: false },
      orderBy: { id: 'asc' },
    });
    if (single && instruments.length === 0) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '计量器具不存在', 404);
    }
    if (
      instruments.some(
        (item) => item.borrowStatus !== INSTRUMENT_BORROW_STATUS.AVAILABLE,
      )
    ) {
      throw new BusinessError(
        ErrorCode.CONFLICT,
        '借用中或待确认归还的器具不可删除',
        409,
      );
    }
    const result = await tx.measuring_instruments.updateMany({
      where: {
        id: { in: instruments.map((item) => item.id) },
        isDeleted: false,
        borrowStatus: INSTRUMENT_BORROW_STATUS.AVAILABLE,
        borrowRecords: {
          none: {
            isDeleted: false,
            status: { in: [...ACTIVE_BORROW_RECORD_STATUSES] },
          },
        },
      },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: operator || null,
      },
    });
    if (result.count !== instruments.length) {
      throw new BusinessError(
        ErrorCode.CONFLICT,
        '器具状态已变化，请刷新后重试',
        409,
      );
    }
    return { instruments, count: result.count };
  });
}

export const MetrologyDeleteService = {
  async deleteById(id: string, operator?: string) {
    const result = await deleteAvailable([id], operator, true);
    const instrument = result.instruments[0];
    if (!instrument)
      throw new BusinessError(ErrorCode.NOT_FOUND, '计量器具不存在', 404);
    return { ...instrument, isDeleted: true };
  },
  async batchDelete(ids: string[], operator?: string) {
    const result = await deleteAvailable(ids, operator);
    return { count: result.count };
  },
};
