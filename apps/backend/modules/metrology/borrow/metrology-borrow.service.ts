import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';

import {
  deriveMetrologyInspectionStatus,
  normalizeMetrologyBorrowStatus,
  startOfToday,
} from '../metrology-status';
import { MetrologyBorrowQueryService } from './metrology-borrow-query.service';
import { MetrologyBorrowReturnService } from './metrology-borrow-return.service';

interface MetrologyBorrowListParams {
  borrowerDepartment?: string;
  borrowerName?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
}

interface MetrologyBorrowMutationPayload {
  borrowedAt?: unknown;
  borrowerDepartment?: unknown;
  borrowerName?: unknown;
  expectedReturnAt?: unknown;
  instrumentId?: unknown;
  remark?: unknown;
}

interface BorrowOverviewParams {
  borrowerDepartment?: string;
  borrowerName?: string;
  keyword?: string;
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

function parseOptionalDateValue(value: unknown, fieldName: string) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { date: null as Date | null, error: null as null | string };
  }

  return parseDateValue(text, fieldName);
}

function normalizeBorrowPayload(body: MetrologyBorrowMutationPayload) {
  const instrumentId = String(body.instrumentId || '').trim();
  const borrowerDepartment = String(body.borrowerDepartment || '').trim();
  const borrowerName = String(body.borrowerName || '').trim();
  const borrowedAt = parseDateValue(body.borrowedAt, '借用日期');
  const expectedReturnAt = parseOptionalDateValue(
    body.expectedReturnAt,
    '预计归还日期',
  );
  const remark = String(body.remark || '').trim() || null;

  return {
    borrowedAt,
    borrowerDepartment,
    borrowerName,
    expectedReturnAt,
    instrumentId,
    remark,
  };
}

async function refreshOverdueStatuses() {
  await prisma.metrology_borrow_records.updateMany({
    where: {
      expectedReturnAt: { lt: startOfToday() },
      isDeleted: false,
      returnedAt: null,
      status: 'BORROWED',
    },
    data: {
      status: 'OVERDUE',
    },
  });
}

export const MetrologyBorrowService = {
  async getList(params: MetrologyBorrowListParams) {
    return MetrologyBorrowQueryService.getList(params);
  },

  async getOverview(params: BorrowOverviewParams) {
    return MetrologyBorrowQueryService.getOverview(params);
  },

  async matchInstruments(keyword: string) {
    return MetrologyBorrowQueryService.matchInstruments(keyword);
  },

  async borrow(payload: MetrologyBorrowMutationPayload, operator?: string) {
    await refreshOverdueStatuses();

    const normalized = normalizeBorrowPayload(payload);
    if (!normalized.instrumentId) {
      throw new Error('量具不能为空');
    }
    if (!normalized.borrowerDepartment) {
      throw new Error('借用部门不能为空');
    }
    if (!normalized.borrowerName) {
      throw new Error('借用人不能为空');
    }
    if (normalized.borrowedAt.error) {
      throw new Error(normalized.borrowedAt.error);
    }
    if (normalized.expectedReturnAt.error) {
      throw new Error(normalized.expectedReturnAt.error);
    }
    if (
      normalized.expectedReturnAt.date &&
      normalized.borrowedAt.date &&
      normalized.expectedReturnAt.date.getTime() <
        normalized.borrowedAt.date.getTime()
    ) {
      throw new Error('预计归还日期不能早于借用日期');
    }

    const instrument = await prisma.measuring_instruments.findFirst({
      where: {
        id: normalized.instrumentId,
        isDeleted: false,
      },
      select: {
        borrowStatus: true,
        id: true,
        inspectionStatus: true,
        validUntil: true,
      },
    });

    if (!instrument) {
      throw new Error('未找到对应量具');
    }

    const inspectionStatus = deriveMetrologyInspectionStatus(
      instrument.inspectionStatus,
      instrument.validUntil,
    );
    if (inspectionStatus === 'DISABLED') {
      throw new Error('停用量具不能借用');
    }
    if (inspectionStatus === 'EXPIRED') {
      throw new Error('超期量具不能借用');
    }
    const borrowStatus = normalizeMetrologyBorrowStatus(
      instrument.borrowStatus,
    );
    if (borrowStatus === 'BORROWED') {
      throw new Error('该量具当前已借出');
    }
    if (borrowStatus === 'RETURN_PENDING') {
      throw new Error('该量具正在等待归还确认');
    }

    const status =
      normalized.expectedReturnAt.date &&
      normalized.expectedReturnAt.date.getTime() < startOfToday().getTime()
        ? 'OVERDUE'
        : 'BORROWED';
    const borrowedAt = normalized.borrowedAt.date;

    if (!borrowedAt) {
      throw new Error('借用日期不能为空');
    }

    await prisma.$transaction(async (tx) => {
      const governedFields = buildGovernedWriteFieldsForTable(
        'metrology_borrow_records',
        {
          borrowerDepartment: normalized.borrowerDepartment,
          borrowerName: normalized.borrowerName,
        },
      );
      const normalizedBorrowerDepartment =
        governedFields.borrowerDepartment || normalized.borrowerDepartment;
      const normalizedBorrowerName =
        governedFields.borrowerName || normalized.borrowerName;
      const governedCanonicalIds =
        await buildGovernedCanonicalWritePairForTable(
          'metrology_borrow_records',
          {
            borrowerDepartment: normalizedBorrowerDepartment,
            borrowerName: normalizedBorrowerName,
          },
        );
      await tx.metrology_borrow_records.create({
        data: {
          borrowedAt,
          // governance-allow-direct-name-id: normalized via helper, explicit field kept for Prisma required create input.
          borrowerDepartment: normalizedBorrowerDepartment,
          borrowerName: normalizedBorrowerName,
          ...governedCanonicalIds,
          createdBy: operator || null,
          expectedReturnAt: normalized.expectedReturnAt.date,
          instrument: {
            connect: {
              id: normalized.instrumentId,
            },
          },
          remark: normalized.remark,
          status,
          updatedBy: operator || null,
        },
      });

      await tx.measuring_instruments.update({
        where: { id: normalized.instrumentId },
        data: {
          borrowStatus: 'BORROWED',
          updatedBy: operator || null,
        },
      });
    });
  },

  async requestReturn(
    id: string,
    payload: { remark?: unknown },
    operator?: string,
  ) {
    return MetrologyBorrowReturnService.requestReturn(id, payload, operator);
  },

  async confirmReturn(
    id: string,
    payload: { remark?: unknown; returnedAt?: unknown },
    operator?: string,
  ) {
    return MetrologyBorrowReturnService.confirmReturn(id, payload, operator);
  },
};
