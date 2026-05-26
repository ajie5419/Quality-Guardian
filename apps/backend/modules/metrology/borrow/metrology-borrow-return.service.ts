import prisma from '~/utils/prisma';

import { normalizeMetrologyBorrowStatus } from '../metrology-status';

const ACTIVE_BORROW_RECORD_STATUSES = [
  'BORROWED',
  'OVERDUE',
  'RETURN_PENDING',
] as const;

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
      throw new Error('未找到对应借用记录');
    }
    if (record.returnedAt || record.status === 'RETURNED') {
      throw new Error('该借用记录已归还');
    }
    if (record.status === 'RETURN_PENDING') {
      throw new Error('该借用记录已提交归还申请，等待保管员确认');
    }

    await prisma.$transaction(async (tx) => {
      await tx.metrology_borrow_records.update({
        where: { id: record.id },
        data: {
          remark: normalized.remark,
          status: 'RETURN_PENDING',
          updatedBy: operator || null,
        },
      });

      await tx.measuring_instruments.update({
        where: { id: record.instrumentId },
        data: {
          borrowStatus: 'RETURN_PENDING',
          updatedBy: operator || null,
        },
      });
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
      throw new Error('未找到对应借用记录');
    }
    if (record.returnedAt) {
      throw new Error('该借用记录已归还');
    }
    if (
      normalized.returnedAt.date &&
      normalized.returnedAt.date.getTime() < record.borrowedAt.getTime()
    ) {
      throw new Error('归还日期不能早于借用日期');
    }

    const returnedAt = normalized.returnedAt.date;
    if (!returnedAt) {
      throw new Error('归还日期不能为空');
    }

    await prisma.$transaction(async (tx) => {
      await tx.metrology_borrow_records.update({
        where: { id: record.id },
        data: {
          remark: normalized.remark,
          returnedAt,
          status: 'RETURNED',
          updatedBy: operator || null,
        },
      });

      const activeRecord = await tx.metrology_borrow_records.findFirst({
        where: {
          instrumentId: record.instrumentId,
          isDeleted: false,
          returnedAt: null,
          status: {
            in: [...ACTIVE_BORROW_RECORD_STATUSES],
          },
          id: { not: record.id },
        },
        select: { id: true, status: true },
      });

      await tx.measuring_instruments.update({
        where: { id: record.instrumentId },
        data: {
          borrowStatus: activeRecord
            ? normalizeMetrologyBorrowStatus(activeRecord.status)
            : 'AVAILABLE',
          updatedBy: operator || null,
        },
      });
    });
  },
};
