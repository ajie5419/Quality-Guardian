import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

import {
  deriveMetrologyInspectionStatus,
  formatMetrologyDate,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  normalizeMetrologyBorrowStatus,
  startOfToday,
} from '../metrology-status';

const BORROW_RECORD_STATUS_LABELS = {
  BORROWED: '已借出',
  OVERDUE: '超期未还',
  RETURN_PENDING: '待确认归还',
  RETURNED: '已归还',
} as const;

type BorrowRecordStatus = keyof typeof BORROW_RECORD_STATUS_LABELS;

const ACTIVE_BORROW_RECORD_STATUSES = [
  'BORROWED',
  'OVERDUE',
  'RETURN_PENDING',
] as const;

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

interface BorrowOverviewParams {
  borrowerDepartment?: string;
  borrowerName?: string;
  keyword?: string;
}

type BorrowRecordOrderByInput =
  Prisma.metrology_borrow_recordsOrderByWithRelationInput;

const BORROW_SORT_FIELDS: Record<string, BorrowRecordOrderByInput> = {
  borrowedAt: { borrowedAt: 'asc' },
  borrowerDepartment: { borrowerDepartment: 'asc' },
  borrowerName: { borrowerName: 'asc' },
  expectedReturnAt: { expectedReturnAt: 'asc' },
  instrumentCode: { instrument: { instrumentCode: 'asc' } },
  instrumentName: { instrument: { instrumentName: 'asc' } },
  model: { instrument: { model: 'asc' } },
  orderNo: { instrument: { orderNo: 'asc' } },
  returnedAt: { returnedAt: 'asc' },
  statusLabel: { status: 'asc' },
  usingUnit: { instrument: { usingUnit: 'asc' } },
};

function buildBorrowOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): BorrowRecordOrderByInput[] {
  const configured = sortBy ? BORROW_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return [{ borrowedAt: 'desc' }, { createdAt: 'desc' }];
  const [field] = Object.keys(configured);
  if (field === 'instrument') {
    const instrumentOrder = configured.instrument || {};
    const [instrumentField] = Object.keys(instrumentOrder);
    return [
      { instrument: { [instrumentField]: sortOrder } },
      { createdAt: 'desc' },
    ];
  }
  return [{ [field]: sortOrder }, { createdAt: 'desc' }];
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
  const borrowStatus = normalizeMetrologyBorrowStatus(
    item.instrument.borrowStatus,
  );
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
  const borrowStatus = normalizeMetrologyBorrowStatus(item.borrowStatus);
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

export const MetrologyBorrowQueryService = {
  async getList(params: MetrologyBorrowListParams) {
    await refreshOverdueStatuses();

    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize || 20), 1), 100);
    const where = buildBorrowRecordWhere(params);
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      prisma.metrology_borrow_records.findMany({
        where,
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
        orderBy: buildBorrowOrderBy(params.sortBy, params.sortOrder),
        skip,
        take: pageSize,
      }),
      prisma.metrology_borrow_records.count({ where }),
    ]);

    return {
      items: rows.map((item) => buildBorrowRecordItem(item)),
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

    // governance-allow-direct-canonical-read: instrument matcher keeps name fuzzy-search for operator UX compatibility.
    const items = await prisma.measuring_instruments.findMany({
      where: {
        isDeleted: false,
        OR: [
          { instrumentCode: { contains: trimmedKeyword } },
          { instrumentName: { contains: trimmedKeyword } },
          { model: { contains: trimmedKeyword } },
          {
            borrowRecords: {
              some: {
                borrowerName: { contains: trimmedKeyword },
                isDeleted: false,
                status: { in: [...ACTIVE_BORROW_RECORD_STATUSES] },
              },
            },
          },
        ],
      },
      select: {
        borrowRecords: {
          where: {
            isDeleted: false,
            status: {
              in: [...ACTIVE_BORROW_RECORD_STATUSES],
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
};
