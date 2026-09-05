import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetrologyBorrowQueryService } from '~/modules/metrology/borrow/metrology-borrow-query.service';
import { MetrologyBorrowReturnService } from '~/modules/metrology/borrow/metrology-borrow-return.service';
import { MetrologyBorrowService } from '~/modules/metrology/borrow/metrology-borrow.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    measuring_instruments: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    metrology_borrow_records: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: () => ({
    borrowerDepartment: 'QA',
    borrowerName: 'Alice',
  }),
  buildGovernedCanonicalWritePairForTable: vi.fn(async () => ({
    borrowerDepartmentId: 'dept-1',
    borrowerNameId: 'user-1',
  })),
}));

const instrument = {
  borrowStatus: 'AVAILABLE',
  id: 'm-1',
  inspectionStatus: 'VALID',
  instrumentCode: 'M-001',
  instrumentName: 'Gauge',
  model: 'G-1',
  orderNo: 1,
  usingUnit: 'QA',
  validUntil: new Date('2099-01-01T00:00:00.000Z'),
};

const borrowRecord = {
  borrowedAt: new Date('2026-01-01T00:00:00.000Z'),
  borrowerDepartment: 'QA',
  borrowerName: 'Alice',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  expectedReturnAt: new Date('2026-01-10T00:00:00.000Z'),
  id: 'borrow-1',
  instrument,
  instrumentId: 'm-1',
  isDeleted: false,
  remark: null,
  returnedAt: null,
  status: 'BORROWED',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('metrology borrow services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists borrow records with filters, sorting, and overdue refresh', async () => {
    vi.mocked(prisma.metrology_borrow_records.findMany).mockResolvedValue([
      borrowRecord,
    ] as never);
    vi.mocked(prisma.metrology_borrow_records.count).mockResolvedValue(
      1 as never,
    );

    const result = await MetrologyBorrowQueryService.getList({
      keyword: 'Gauge',
      page: 2,
      pageSize: 500,
      sortBy: 'instrumentCode',
      sortOrder: 'desc',
      status: 'borrowed',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'borrow-1',
        instrumentCode: 'M-001',
        status: 'BORROWED',
      }),
    );
    expect(prisma.metrology_borrow_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'OVERDUE' },
      }),
    );
    expect(prisma.metrology_borrow_records.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 100,
        orderBy: [
          { instrument: { instrumentCode: 'desc' } },
          { createdAt: 'desc' },
        ],
      }),
    );
  });

  it('builds borrow overview and matches instruments', async () => {
    vi.mocked(prisma.metrology_borrow_records.findMany).mockResolvedValue([
      borrowRecord,
    ] as never);
    vi.mocked(prisma.measuring_instruments.findMany).mockResolvedValue([
      { ...instrument, borrowRecords: [borrowRecord] },
    ] as never);

    const overview = await MetrologyBorrowQueryService.getOverview({});
    const matches = await MetrologyBorrowQueryService.matchInstruments('Gauge');

    expect(overview.summary.totalCount).toBe(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({
        currentBorrowRecordId: 'borrow-1',
        id: 'm-1',
      }),
    );
  });

  it('returns no instrument matches for empty keyword', async () => {
    await expect(
      MetrologyBorrowQueryService.matchInstruments(' '),
    ).resolves.toEqual([]);
    expect(prisma.measuring_instruments.findMany).not.toHaveBeenCalled();
  });

  it('borrows an available instrument via CAS claim and record create', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue(
      instrument as never,
    );
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      metrology_borrow_records: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await MetrologyBorrowService.borrow(
      {
        borrowedAt: '2099-01-01',
        borrowerDepartment: 'QA',
        borrowerName: 'Alice',
        expectedReturnAt: '2099-01-10',
        instrumentId: 'm-1',
      },
      'admin',
    );

    expect(tx.measuring_instruments.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'm-1',
        isDeleted: false,
        borrowStatus: 'AVAILABLE',
      },
      data: { borrowStatus: 'BORROWED', updatedBy: 'admin' },
    });
    expect(tx.metrology_borrow_records.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        borrowerDepartment: 'QA',
        borrowerDepartmentId: 'dept-1',
        borrowerName: 'Alice',
        borrowerNameId: 'user-1',
        createdBy: 'admin',
        status: 'BORROWED',
      }),
    });
  });

  it('rejects a second concurrent borrow with 409 and does not create a record', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue(
      instrument as never,
    );
    const create = vi.fn();
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      metrology_borrow_records: { create, findFirst: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      MetrologyBorrowService.borrow(
        {
          borrowedAt: '2099-01-01',
          borrowerDepartment: 'QA',
          borrowerName: 'Alice',
          expectedReturnAt: '2099-01-10',
          instrumentId: 'm-1',
        },
        'admin',
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      httpStatus: 409,
      message: '该量具当前不可借用或已被其他用户借出',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects borrow when a legacy active record outlives an available instrument', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue(
      instrument as never,
    );
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      metrology_borrow_records: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'stale-1' }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      MetrologyBorrowService.borrow(
        {
          borrowedAt: '2099-01-01',
          borrowerDepartment: 'QA',
          borrowerName: 'Alice',
          expectedReturnAt: '2099-01-10',
          instrumentId: 'm-1',
        },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(tx.metrology_borrow_records.create).not.toHaveBeenCalled();
  });

  it('rejects borrow when dates or instrument inspection state are invalid', async () => {
    await expect(
      MetrologyBorrowService.borrow({
        borrowedAt: '2026-01-10',
        borrowerDepartment: 'QA',
        borrowerName: 'Alice',
        expectedReturnAt: '2026-01-01',
        instrumentId: 'm-1',
      }),
    ).rejects.toThrow('预计归还日期不能早于借用日期');

    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue({
      ...instrument,
      inspectionStatus: 'DISABLED',
    } as never);
    await expect(
      MetrologyBorrowService.borrow({
        borrowedAt: '2026-01-01',
        borrowerDepartment: 'QA',
        borrowerName: 'Alice',
        instrumentId: 'm-1',
      }),
    ).rejects.toThrow('停用量具不能借用');
  });

  it('rolls back the instrument claim when record creation fails', async () => {
    vi.mocked(prisma.measuring_instruments.findFirst).mockResolvedValue(
      instrument as never,
    );
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      metrology_borrow_records: {
        create: vi.fn().mockRejectedValue(new Error('db write failed')),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      await cb(tx);
    });

    await expect(
      MetrologyBorrowService.borrow(
        {
          borrowedAt: '2099-01-01',
          borrowerDepartment: 'QA',
          borrowerName: 'Alice',
          expectedReturnAt: '2099-01-10',
          instrumentId: 'm-1',
        },
        'admin',
      ),
    ).rejects.toThrow('db write failed');
    // The instrument CAS claim and the record create share one transaction, so
    // a failed create aborts the whole unit and reverts the instrument state.
    expect(tx.measuring_instruments.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.metrology_borrow_records.create).toHaveBeenCalledTimes(1);
  });

  it('requests return via CAS on record and instrument', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'BORROWED',
    } as never);
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      metrology_borrow_records: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await MetrologyBorrowReturnService.requestReturn(
      'borrow-1',
      { remark: ' done ' },
      'admin',
    );

    expect(tx.metrology_borrow_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'borrow-1',
        isDeleted: false,
        status: { in: ['BORROWED', 'OVERDUE'] },
      },
      data: { remark: 'done', status: 'RETURN_PENDING', updatedBy: 'admin' },
    });
    expect(tx.measuring_instruments.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'm-1',
        isDeleted: false,
        borrowStatus: 'BORROWED',
      },
      data: { borrowStatus: 'RETURN_PENDING', updatedBy: 'admin' },
    });
  });

  it('rejects a repeated requestReturn with 409', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'BORROWED',
    } as never);
    const instrumentUpdate = vi.fn();
    const tx = {
      measuring_instruments: { updateMany: instrumentUpdate },
      metrology_borrow_records: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      MetrologyBorrowReturnService.requestReturn('borrow-1', {}, 'admin'),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(instrumentUpdate).not.toHaveBeenCalled();
  });

  it('rejects requestReturn on an already returned record', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: new Date('2026-01-02T00:00:00.000Z'),
      status: 'RETURNED',
    } as never);

    await expect(
      MetrologyBorrowReturnService.requestReturn('borrow-1', {}, 'admin'),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
  });

  it('confirms return via CAS and restores instrument to available', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      borrowedAt: new Date('2026-01-01T00:00:00.000Z'),
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'RETURN_PENDING',
    } as never);
    const tx = {
      measuring_instruments: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      metrology_borrow_records: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await MetrologyBorrowReturnService.confirmReturn(
      'borrow-1',
      { returnedAt: '2026-01-02', remark: 'returned' },
      'admin',
    );

    expect(tx.metrology_borrow_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'borrow-1',
        isDeleted: false,
        status: 'RETURN_PENDING',
      },
      data: expect.objectContaining({
        remark: 'returned',
        returnedAt: new Date('2026-01-02T00:00:00'),
        status: 'RETURNED',
        updatedBy: 'admin',
      }),
    });
    expect(tx.measuring_instruments.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'm-1',
        isDeleted: false,
        borrowStatus: 'RETURN_PENDING',
      },
      data: { borrowStatus: 'AVAILABLE', updatedBy: 'admin' },
    });
  });

  it('rejects a duplicate confirmReturn with 409', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      borrowedAt: new Date('2026-01-01T00:00:00.000Z'),
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'RETURN_PENDING',
    } as never);
    const instrumentUpdate = vi.fn();
    const tx = {
      measuring_instruments: { updateMany: instrumentUpdate },
      metrology_borrow_records: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      MetrologyBorrowReturnService.confirmReturn(
        'borrow-1',
        { returnedAt: '2026-01-02' },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(instrumentUpdate).not.toHaveBeenCalled();
  });

  it('rejects confirmReturn when the record is not return-pending', async () => {
    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValue({
      borrowedAt: new Date('2026-01-01T00:00:00.000Z'),
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'BORROWED',
    } as never);
    const instrumentUpdate = vi.fn();
    const tx = {
      measuring_instruments: { updateMany: instrumentUpdate },
      metrology_borrow_records: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      MetrologyBorrowReturnService.confirmReturn(
        'borrow-1',
        { returnedAt: '2026-01-02' },
        'admin',
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(instrumentUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid return confirmation payloads and already returned records', async () => {
    await expect(
      MetrologyBorrowReturnService.confirmReturn('borrow-1', {
        returnedAt: '',
      }),
    ).rejects.toThrow('归还日期不能为空');

    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValueOnce(
      null,
    );
    await expect(
      MetrologyBorrowReturnService.confirmReturn('borrow-1', {
        returnedAt: '2026-01-05',
      }),
    ).rejects.toThrow('未找到对应借用记录');

    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValueOnce({
      borrowedAt: new Date('2026-01-10T00:00:00.000Z'),
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: null,
      status: 'BORROWED',
    } as never);
    await expect(
      MetrologyBorrowReturnService.confirmReturn('borrow-1', {
        returnedAt: '2026-01-05',
      }),
    ).rejects.toThrow('归还日期不能早于借用日期');

    vi.mocked(prisma.metrology_borrow_records.findFirst).mockResolvedValueOnce({
      borrowedAt: new Date('2026-01-01T00:00:00.000Z'),
      id: 'borrow-1',
      instrumentId: 'm-1',
      returnedAt: new Date('2026-01-05T00:00:00.000Z'),
      status: 'RETURNED',
    } as never);
    await expect(
      MetrologyBorrowReturnService.confirmReturn('borrow-1', {
        returnedAt: '2026-01-06',
      }),
    ).rejects.toThrow('该借用记录已归还');
  });
});
