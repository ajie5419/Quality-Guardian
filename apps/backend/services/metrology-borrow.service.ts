import {
  deriveMetrologyInspectionStatus,
  formatMetrologyDate,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  startOfToday,
} from '~/utils/metrology-status';
import prisma from '~/utils/prisma';

const BORROW_RECORD_STATUS_LABELS = {
  BORROWED: '已借出',
  OVERDUE: '超期未还',
  RETURNED: '已归还',
} as const;

type BorrowRecordStatus = keyof typeof BORROW_RECORD_STATUS_LABELS;

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

interface MetrologyBorrowReturnPayload {
  remark?: unknown;
  returnedAt?: unknown;
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

function compareValues(
  left: null | number | string | undefined,
  right: null | number | string | undefined,
  direction: 'asc' | 'desc',
) {
  const leftValue = left ?? '';
  const rightValue = right ?? '';

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return direction === 'asc'
      ? leftValue - rightValue
      : rightValue - leftValue;
  }

  const compareResult = String(leftValue).localeCompare(
    String(rightValue),
    'zh-CN',
    {
      numeric: true,
      sensitivity: 'base',
    },
  );
  return direction === 'asc' ? compareResult : -compareResult;
}

function sortList(
  items: ReturnType<typeof buildBorrowRecordItem>[],
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
) {
  if (!sortBy) {
    return items;
  }

  const sortableFields = new Set([
    'borrowedAt',
    'borrowerDepartment',
    'borrowerName',
    'expectedReturnAt',
    'instrumentCode',
    'instrumentName',
    'model',
    'orderNo',
    'returnedAt',
    'statusLabel',
    'usingUnit',
  ]);

  if (!sortableFields.has(sortBy)) {
    return items;
  }

  return [...items].sort((left, right) =>
    compareValues(
      left[sortBy as keyof typeof left] as null | number | string | undefined,
      right[sortBy as keyof typeof right] as null | number | string | undefined,
      sortOrder,
    ),
  );
}

function normalizeListFilters(params: MetrologyBorrowListParams) {
  return {
    borrowerDepartment: String(params.borrowerDepartment || '').trim(),
    borrowerName: String(params.borrowerName || '').trim(),
    keyword: String(params.keyword || '').trim(),
    status: String(params.status || '')
      .trim()
      .toUpperCase(),
  };
}

function buildBorrowRecordWhere(
  params: BorrowOverviewParams & { status?: string },
  options?: { ignoreStatus?: boolean },
) {
  const filters = normalizeListFilters(params);

  return {
    isDeleted: false,
    ...(filters.borrowerDepartment
      ? { borrowerDepartment: { contains: filters.borrowerDepartment } }
      : {}),
    ...(filters.borrowerName
      ? { borrowerName: { contains: filters.borrowerName } }
      : {}),
    ...(!options?.ignoreStatus && filters.status
      ? { status: filters.status }
      : {}),
    instrument: {
      isDeleted: false,
      ...(filters.keyword
        ? {
            OR: [
              { instrumentCode: { contains: filters.keyword } },
              { instrumentName: { contains: filters.keyword } },
              { model: { contains: filters.keyword } },
            ],
          }
        : {}),
    },
  };
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

function normalizeReturnPayload(body: MetrologyBorrowReturnPayload) {
  const returnedAt = parseDateValue(body.returnedAt, '归还日期');
  const remark = String(body.remark || '').trim() || null;

  return {
    remark,
    returnedAt,
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

function buildBorrowRecordItem(item: {
  borrowedAt: Date;
  borrowerDepartment: string;
  borrowerName: string;
  createdAt: Date;
  expectedReturnAt: Date | null;
  id: string;
  instrument: {
    borrowStatus: string;
    id: string;
    inspectionStatus: string;
    instrumentCode: string;
    instrumentName: string;
    model: null | string;
    orderNo: null | number;
    usingUnit: null | string;
    validUntil: Date | null;
  };
  remark: null | string;
  returnedAt: Date | null;
  status: string;
  updatedAt: Date;
}) {
  const inspectionStatus = deriveMetrologyInspectionStatus(
    item.instrument.inspectionStatus,
    item.instrument.validUntil,
  );
  const borrowStatus =
    String(item.instrument.borrowStatus || '').toUpperCase() === 'BORROWED'
      ? 'BORROWED'
      : 'AVAILABLE';
  const recordStatus = String(
    item.status || '',
  ).toUpperCase() as BorrowRecordStatus;

  return {
    borrowStatus,
    borrowStatusLabel: getMetrologyBorrowStatusLabel(borrowStatus),
    borrowedAt: formatMetrologyDate(item.borrowedAt),
    borrowerDepartment: item.borrowerDepartment,
    borrowerName: item.borrowerName,
    createdAt: item.createdAt.toISOString(),
    expectedReturnAt: formatMetrologyDate(item.expectedReturnAt),
    id: item.id,
    inspectionStatus,
    inspectionStatusLabel: getMetrologyInspectionStatusLabel(inspectionStatus),
    instrumentCode: item.instrument.instrumentCode,
    instrumentId: item.instrument.id,
    instrumentName: item.instrument.instrumentName,
    model: item.instrument.model,
    orderNo: item.instrument.orderNo,
    remark: item.remark,
    returnedAt: formatMetrologyDate(item.returnedAt),
    status: recordStatus,
    statusLabel: BORROW_RECORD_STATUS_LABELS[recordStatus],
    updatedAt: item.updatedAt.toISOString(),
    usingUnit: item.instrument.usingUnit,
    validUntil: formatMetrologyDate(item.instrument.validUntil),
  };
}

function buildInstrumentMatchItem(item: {
  borrowRecords: Array<{
    borrowedAt: Date;
    borrowerDepartment: string;
    borrowerName: string;
    id: string;
  }>;
  borrowStatus: string;
  id: string;
  inspectionStatus: string;
  instrumentCode: string;
  instrumentName: string;
  model: null | string;
  orderNo: null | number;
  usingUnit: null | string;
  validUntil: Date | null;
}) {
  const inspectionStatus = deriveMetrologyInspectionStatus(
    item.inspectionStatus,
    item.validUntil,
  );
  const borrowStatus =
    String(item.borrowStatus || '').toUpperCase() === 'BORROWED'
      ? 'BORROWED'
      : 'AVAILABLE';
  const currentBorrow = item.borrowRecords[0];

  return {
    borrowStatus,
    borrowStatusLabel: getMetrologyBorrowStatusLabel(borrowStatus),
    currentBorrowRecordId: currentBorrow?.id || null,
    currentBorrowedAt: formatMetrologyDate(currentBorrow?.borrowedAt),
    currentBorrowerDepartment: currentBorrow?.borrowerDepartment || null,
    currentBorrowerName: currentBorrow?.borrowerName || null,
    id: item.id,
    inspectionStatus,
    inspectionStatusLabel: getMetrologyInspectionStatusLabel(inspectionStatus),
    instrumentCode: item.instrumentCode,
    instrumentName: item.instrumentName,
    model: item.model,
    orderNo: item.orderNo,
    usingUnit: item.usingUnit,
    validUntil: formatMetrologyDate(item.validUntil),
  };
}

export const MetrologyBorrowService = {
  async getList(params: MetrologyBorrowListParams) {
    await refreshOverdueStatuses();

    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(params.pageSize || 20), 1),
      100_000,
    );

    const rows = await prisma.metrology_borrow_records.findMany({
      where: buildBorrowRecordWhere(params),
      include: {
        instrument: {
          select: {
            borrowStatus: true,
            id: true,
            inspectionStatus: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
            validUntil: true,
          },
        },
      },
      orderBy: [{ borrowedAt: 'desc' }, { createdAt: 'desc' }],
    });

    let list = rows.map((item) => buildBorrowRecordItem(item));
    list = sortList(list, params.sortBy, params.sortOrder);

    const total = list.length;
    const start = (page - 1) * pageSize;
    list = list.slice(start, start + pageSize);

    return {
      items: list,
      total,
    };
  },

  async getOverview(params: BorrowOverviewParams) {
    await refreshOverdueStatuses();

    const rows = await prisma.metrology_borrow_records.findMany({
      where: buildBorrowRecordWhere(params, { ignoreStatus: true }),
      include: {
        instrument: {
          select: {
            borrowStatus: true,
            id: true,
            inspectionStatus: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
            validUntil: true,
          },
        },
      },
      orderBy: [{ borrowedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const items = rows.map((item) => buildBorrowRecordItem(item));
    const todayText = formatMetrologyDate(startOfToday());
    const currentYear = new Date().getFullYear();
    const upcomingEnd = new Date(startOfToday());
    upcomingEnd.setDate(upcomingEnd.getDate() + 7);
    const upcomingEndText = formatMetrologyDate(upcomingEnd);

    const summary = {
      borrowedCount: 0,
      overdueCount: 0,
      todayBorrowedCount: 0,
      todayReturnedCount: 0,
      totalCount: items.length,
      upcomingReturnCount: 0,
    };
    const monthlyDistribution = Array.from({ length: 12 }, (_, index) => ({
      borrowedCount: 0,
      month: index + 1,
      returnedCount: 0,
    }));

    for (const item of items) {
      if (item.status === 'BORROWED') {
        summary.borrowedCount += 1;
      } else if (item.status === 'OVERDUE') {
        summary.overdueCount += 1;
      }

      if (item.borrowedAt === todayText) {
        summary.todayBorrowedCount += 1;
      }
      if (item.returnedAt === todayText) {
        summary.todayReturnedCount += 1;
      }

      if (
        item.status !== 'RETURNED' &&
        item.expectedReturnAt &&
        item.expectedReturnAt <= upcomingEndText
      ) {
        summary.upcomingReturnCount += 1;
      }

      const borrowedDate = new Date(`${item.borrowedAt}T00:00:00`);
      if (
        !Number.isNaN(borrowedDate.getTime()) &&
        borrowedDate.getFullYear() === currentYear
      ) {
        const distribution = monthlyDistribution[borrowedDate.getMonth()];
        if (distribution) {
          distribution.borrowedCount += 1;
        }
      }

      if (item.returnedAt) {
        const returnedDate = new Date(`${item.returnedAt}T00:00:00`);
        if (
          !Number.isNaN(returnedDate.getTime()) &&
          returnedDate.getFullYear() === currentYear
        ) {
          const distribution = monthlyDistribution[returnedDate.getMonth()];
          if (distribution) {
            distribution.returnedCount += 1;
          }
        }
      }
    }

    const upcomingItems = items
      .filter(
        (item) =>
          item.status !== 'RETURNED' &&
          typeof item.expectedReturnAt === 'string' &&
          item.expectedReturnAt <= upcomingEndText,
      )
      .sort((left, right) =>
        compareValues(left.expectedReturnAt, right.expectedReturnAt, 'asc'),
      )
      .slice(0, 10);

    return {
      monthlyDistribution,
      summary,
      upcomingItems,
    };
  },

  async matchInstruments(keyword: string) {
    await refreshOverdueStatuses();

    const trimmedKeyword = String(keyword || '').trim();
    if (!trimmedKeyword) {
      return [];
    }

    const items = await prisma.measuring_instruments.findMany({
      where: {
        isDeleted: false,
        OR: [
          { instrumentCode: { contains: trimmedKeyword } },
          { instrumentName: { contains: trimmedKeyword } },
          { model: { contains: trimmedKeyword } },
        ],
      },
      select: {
        borrowRecords: {
          where: {
            isDeleted: false,
            status: {
              in: ['BORROWED', 'OVERDUE'],
            },
          },
          orderBy: [{ borrowedAt: 'desc' }],
          take: 1,
          select: {
            borrowedAt: true,
            borrowerDepartment: true,
            borrowerName: true,
            id: true,
          },
        },
        borrowStatus: true,
        id: true,
        inspectionStatus: true,
        instrumentCode: true,
        instrumentName: true,
        model: true,
        orderNo: true,
        usingUnit: true,
        validUntil: true,
      },
      orderBy: [{ orderNo: 'asc' }, { instrumentCode: 'asc' }],
      take: 20,
    });

    return items.map((item) => buildInstrumentMatchItem(item));
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
    if (String(instrument.borrowStatus || '').toUpperCase() === 'BORROWED') {
      throw new Error('该量具当前已借出');
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
      await tx.metrology_borrow_records.create({
        data: {
          borrowedAt,
          borrowerDepartment: normalized.borrowerDepartment,
          borrowerName: normalized.borrowerName,
          createdBy: operator || null,
          expectedReturnAt: normalized.expectedReturnAt.date,
          instrumentId: normalized.instrumentId,
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

  async returnBorrow(
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
            in: ['BORROWED', 'OVERDUE'],
          },
        },
        select: { id: true },
      });

      await tx.measuring_instruments.update({
        where: { id: record.instrumentId },
        data: {
          borrowStatus: activeRecord ? 'BORROWED' : 'AVAILABLE',
          updatedBy: operator || null,
        },
      });
    });
  },
};
