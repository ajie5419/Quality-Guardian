import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  BORROW_RECORD_STATUS,
  INSTRUMENT_BORROW_STATUS,
  throwBorrowConflict,
} from './metrology-borrow-state';

interface MetrologyBorrowReturnPayload {
  remark?: unknown;
  returnedAt?: unknown;
}

interface MetrologyBorrowReturnRequestPayload {
  remark?: unknown;
}

function parseDateValue(value: unknown, fieldName: string) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { date: null as Date | null, error: `${fieldName}不能为空` };
  }

  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { date: null, error: `${fieldName}格式无效` };
  }

  return { date, error: null as null | string };
}

function normalizeReturnPayload(body: MetrologyBorrowReturnPayload) {
  const returnedAt = parseDateValue(body.returnedAt, '归还日期');
  const remark = String(body.remark || '').trim() || null;

  return {
    remark,
    returnedAt,
  };
}

function normalizeReturnRequestPayload(
  body: MetrologyBorrowReturnRequestPayload,
) {
  const remark = String(body.remark || '').trim() || null;

  return {
    remark,
  };
}

export const MetrologyBorrowReturnService = {
  async requestReturn(
    id: string,
    payload: MetrologyBorrowReturnRequestPayload,
    operator?: string,
  ) {
    const normalized = normalizeReturnRequestPayload(payload);

    const record = await prisma.metrology_borrow_records.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      select: {
        id: true,
        instrumentId: true,
        returnedAt: true,
        status: true,
      },
    });

    if (!record) {
      throw new BusinessError('NOT_FOUND', '未找到对应借用记录', 404);
    }
    if (record.returnedAt || record.status === 'RETURNED') {
      throwBorrowConflict('该借用记录已归还');
    }
    if (record.status === 'RETURN_PENDING') {
      throwBorrowConflict('该借用记录已提交归还申请，等待保管员确认');
    }

    await prisma.$transaction(async (tx) => {
      // CAS on the record: only a BORROWED/OVERDUE record may move to
      // RETURN_PENDING, so a duplicate request is a 409, never a double write.
      const recordClaim = await tx.metrology_borrow_records.updateMany({
        where: {
          id: record.id,
          isDeleted: false,
          status: {
            in: [BORROW_RECORD_STATUS.BORROWED, BORROW_RECORD_STATUS.OVERDUE],
          },
        },
        data: {
          remark: normalized.remark,
          status: BORROW_RECORD_STATUS.RETURN_PENDING,
          updatedBy: operator || null,
        },
      });
      if (recordClaim.count !== 1) {
        throwBorrowConflict('该借用记录状态已变化，无法提交归还');
      }

      const instrumentClaim = await tx.measuring_instruments.updateMany({
        where: {
          id: record.instrumentId,
          isDeleted: false,
          borrowStatus: INSTRUMENT_BORROW_STATUS.BORROWED,
        },
        data: {
          borrowStatus: INSTRUMENT_BORROW_STATUS.RETURN_PENDING,
          updatedBy: operator || null,
        },
      });
      if (instrumentClaim.count !== 1) {
        throwBorrowConflict('量具状态异常，无法提交归还');
      }
    });
  },

  async confirmReturn(
    id: string,
    payload: MetrologyBorrowReturnPayload,
    operator?: string,
  ) {
    const normalized = normalizeReturnPayload(payload);
    if (normalized.returnedAt.error) {
      throw new Error(normalized.returnedAt.error);
    }

    const record = await prisma.metrology_borrow_records.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      select: {
        borrowedAt: true,
        id: true,
        instrumentId: true,
        returnedAt: true,
        status: true,
      },
    });

    if (!record) {
      throw new BusinessError('NOT_FOUND', '未找到对应借用记录', 404);
    }
    if (record.returnedAt) {
      throwBorrowConflict('该借用记录已归还');
    }
    if (
      normalized.returnedAt.date &&
      normalized.returnedAt.date.getTime() < record.borrowedAt.getTime()
    ) {
      throw new Error('归还日期不能早于借用日期');
    }

    const returnedAt = normalized.returnedAt.date;
    if (!returnedAt) {
      throw new BusinessError('VALIDATION', '归还日期不能为空', 400);
    }

    await prisma.$transaction(async (tx) => {
      // CAS on the record: only RETURN_PENDING may confirm to RETURNED; a
      // duplicate confirm or a raced return request gets a 409 and rolls back
      // the instrument transition too.
      const recordClaim = await tx.metrology_borrow_records.updateMany({
        where: {
          id: record.id,
          isDeleted: false,
          status: BORROW_RECORD_STATUS.RETURN_PENDING,
        },
        data: {
          remark: normalized.remark,
          returnedAt,
          status: BORROW_RECORD_STATUS.RETURNED,
          updatedBy: operator || null,
        },
      });
      if (recordClaim.count !== 1) {
        throwBorrowConflict('该借用记录状态已变化，无法确认归还');
      }

      const instrumentClaim = await tx.measuring_instruments.updateMany({
        where: {
          id: record.instrumentId,
          isDeleted: false,
          borrowStatus: INSTRUMENT_BORROW_STATUS.RETURN_PENDING,
        },
        data: {
          borrowStatus: INSTRUMENT_BORROW_STATUS.AVAILABLE,
          updatedBy: operator || null,
        },
      });
      if (instrumentClaim.count !== 1) {
        throwBorrowConflict('量具状态异常，无法确认归还');
      }
    });
  },
};
