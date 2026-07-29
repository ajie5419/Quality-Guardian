import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncCloseAttachments } from '~/modules/inspection/inspection-request-close-effects.service';
import { createCloseInspectionRecords } from '~/modules/inspection/inspection-request-close-records.service';
import { InspectionRequestCloseService } from '~/modules/inspection/inspection-request-close.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
    },
    inspections: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  },
}));

const { mockNormalizeText, mockNormalizeAttachments, mockParseQuantity } =
  vi.hoisted(() => ({
    mockNormalizeText: (v: unknown) => String(v ?? '').trim(),
    mockNormalizeAttachments: (v: unknown): any[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    },
    mockParseQuantity: (v: unknown, fallback = 1) => {
      const parsed = Number(v);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(1, Math.trunc(parsed));
    },
  }));

vi.mock('~/modules/inspection/inspection-request-close.schema', async () => {
  const { BusinessError: BE } = await import('~/utils/business-error');
  return {
    failCloseRequest: (prefix: string, message: string) => {
      const map: Record<string, number> = {
        VALIDATION: 400,
        BAD_REQUEST: 400,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        INTERNAL: 500,
      };
      throw new BE(prefix, message, map[prefix] ?? 400);
    },
    parseCloseRequestNumber: (value: unknown, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    validateCloseRequestBody: (body: Record<string, unknown>) => {
      const BE2 = BE;
      const result = mockNormalizeText(body.result).toUpperCase();
      if (result !== 'PASS' && result !== 'FAIL')
        throw new BE2('VALIDATION', '检验结果必须为合格或不合格', 400);
      const closeAttachments = mockNormalizeAttachments(body.attachments);
      if (result === 'PASS' && closeAttachments.length === 0)
        throw new BE2('VALIDATION', '检验记录不能为空', 400);
      const quantity = mockParseQuantity(body.quantity);
      const rawUQ = Number(body.unqualifiedQuantity);
      const fallback = result === 'FAIL' ? 1 : 0;
      const unqualifiedQuantity = Number.isFinite(rawUQ)
        ? Math.max(0, Math.min(quantity, rawUQ))
        : fallback;
      if (result === 'PASS' && unqualifiedQuantity > 0)
        throw new BE2(
          'VALIDATION',
          '检验结果为合格时，不合格数量必须为 0',
          400,
        );
      if (result !== 'FAIL') return;
      if (unqualifiedQuantity <= 0)
        throw new BE2(
          'VALIDATION',
          '检验结果为不合格时，不合格数量必须大于 0',
          400,
        );
      if (!body.linkedIssue || typeof body.linkedIssue !== 'object')
        throw new BE2(
          'VALIDATION',
          '检验结果为不合格时必须填写不合格项信息',
          400,
        );
      const li = body.linkedIssue as Record<string, unknown>;
      if (mockNormalizeAttachments(li.photos).length === 0)
        throw new BE2('VALIDATION', '不合格项照片不能为空', 400);
      for (const [key, label] of [
        ['partName', '组件名称'],
        ['processName', '工序'],
        ['responsibleDepartment', '责任部门'],
        ['defectType', '缺陷分类'],
        ['defectSubtype', '二级分类'],
        ['severity', '严重程度'],
        ['status', '状态'],
        ['description', '不合格描述'],
        ['rootCause', '原因分析'],
        ['solution', '解决方案'],
      ] as const) {
        if (!mockNormalizeText(li[key]))
          throw new BE2('VALIDATION', `不合格项${label}不能为空`, 400);
      }
    },
  };
});

vi.mock(
  '~/modules/inspection/inspection-request-close-records.service',
  () => ({
    createCloseInspectionRecords: vi
      .fn()
      .mockResolvedValue([
        { inspectionId: 'i-1', isPrimary: true, workOrderNumber: 'WO-1' },
      ]),
  }),
);

vi.mock('~/modules/inspection/inspection-request-close-issue.service', () => ({
  buildCloseLinkedIssueCreateResult: vi.fn().mockResolvedValue({
    auditVariables: { issue: 'test', nonConformanceNumber: 'NC-001' },
    createData: {
      claim: 'No',
      description: 'defect',
      inspectionId: 'i-1',
      lossAmount: 0,
      partName: 'Bearing',
      processName: 'Welding',
      projectName: 'Project A',
      quantity: 2,
      reportedBy: 'Reporter A',
      responsibleDepartment: 'Prod',
      rootCause: 'fatigue',
      severity: 'Minor',
      solution: 'rework',
      sourceType: 'INSPECTION_REQUEST',
      status: 'OPEN',
      workOrderNumber: 'WO-1',
    },
  }),
}));

vi.mock(
  '~/modules/inspection/inspection-request-close-effects.service',
  () => ({
    syncCloseAttachments: vi.fn(),
    syncCloseIssueEffects: vi.fn(),
  }),
);

vi.mock('~/modules/inspection/inspection-request', () => ({
  INSPECTION_REQUEST_STATUS: {
    CLOSED: 'CLOSED',
    INSPECTING: 'INSPECTING',
  },
  mapInspectionRequest: vi.fn().mockImplementation((r) => r),
  normalizeInspectionRequestAttachments: mockNormalizeAttachments,
  normalizeInspectionRequestText: mockNormalizeText,
  parseInspectionRequestQuantity: mockParseQuantity,
  resolveInspectionRequestCurrentUserId: vi.fn().mockResolvedValue('user-1'),
}));

vi.mock('~/modules/inspection/inspection-request-work-orders', () => ({
  inspectionRequestWorkOrdersInclude: {},
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    enqueueSupplierScoresForInspectionIdentities: vi.fn(),
  },
}));

const ATTACHMENTS = [{ name: 'f.pdf', url: 'http://example.com/f.pdf' }];

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    componentName: 'Bearing',
    id: 'req-1',
    inspectorId: null,
    isDeleted: false,
    linkedIssueId: null,
    linkedIssueNo: null,
    linkedIssueStatus: null,
    partName: 'Bearing',
    process: { name: 'Welding' },
    processName: 'Welding',
    quantity: 10,
    reporter: 'Reporter A',
    requestInfo: null,
    requestNo: 'REQ-001',
    status: 'PENDING',
    workOrderNumber: 'WO-1',
    workOrders: [],
    work_order: { projectName: 'Project A' },
    ...overrides,
  };
}

const MOCK_USER = { id: 'user-1', username: 'admin' } as any;
const MOCK_EVENT = {} as any;

function mockTransaction(updates: Record<string, unknown> = {}) {
  const requestUpdate = {
    ...makeRequest(),
    status: 'CLOSED',
    ...updates,
  };
  return (prisma.$transaction as any).mockImplementation(async (cb: any) =>
    cb({
      inspections: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      quality_records: { create: vi.fn().mockResolvedValue(null) },
      qms_inspection_request_inspections: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_inspection_requests: {
        update: vi.fn().mockResolvedValue(requestUpdate),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      qms_task_dispatches: { updateMany: vi.fn() },
    }),
  );
}

function makeTxMock(overrides: Record<string, unknown> = {}) {
  const requestUpdate = {
    ...makeRequest(),
    ...overrides,
  };
  return {
    inspections: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    quality_records: { create: vi.fn().mockResolvedValue(null) },
    qms_inspection_request_inspections: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    qms_inspection_requests: {
      update: vi.fn().mockResolvedValue(requestUpdate),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    qms_task_dispatches: { updateMany: vi.fn() },
  };
}

const VALID_LINKED_ISSUE = {
  description: 'defect',
  defectSubtype: 'crack',
  defectType: 'surface',
  partName: 'Bearing',
  photos: [{ name: 'defect.jpg', url: 'http://example.com/defect.jpg' }],
  processName: 'Welding',
  responsibleDepartment: 'Prod',
  rootCause: 'fatigue',
  severity: 'Minor',
  solution: 'rework',
  status: 'OPEN',
};

describe('inspection-request-close adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('result normalization edge cases', () => {
    it('rejects result=undefined (empty string after normalize)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: ATTACHMENTS, result: undefined, quantity: 10 },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果必须为合格或不合格');
    });

    it('rejects result="" (empty string)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: ATTACHMENTS, result: '', quantity: 10 },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果必须为合格或不合格');
    });

    it('accepts result="pass" (case-insensitive → PASS)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      mockTransaction();

      const result = await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, result: 'pass', quantity: 10 },
        MOCK_USER,
      );
      expect(result).toBeDefined();
    });

    it('accepts result="Pass" (mixed case → PASS)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      mockTransaction();

      const result = await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, result: 'Pass', quantity: 10 },
        MOCK_USER,
      );
      expect(result).toBeDefined();
    });

    it('accepts result="fail" (case-insensitive → FAIL)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      mockTransaction();

      const result = await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 10,
          result: 'fail',
          unqualifiedQuantity: 2,
        },
        MOCK_USER,
      );
      expect(result).toBeDefined();
    });

    it('rejects result="PASSING" (not a valid value)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: ATTACHMENTS, result: 'PASSING', quantity: 10 },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果必须为合格或不合格');
    });

    it('rejects result="OK" (not a valid value)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: ATTACHMENTS, result: 'OK', quantity: 10 },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果必须为合格或不合格');
    });
  });

  describe('pASS path quantity validation', () => {
    it('rejects PASS with unqualifiedQuantity > 0', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            quantity: 10,
            result: 'PASS',
            unqualifiedQuantity: 3,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为合格时，不合格数量必须为 0');
    });

    it('pASS path: unqualifiedQuantity forced to 0 regardless of input', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.unqualifiedQuantity).toBe(0);
      expect(data.qualifiedQuantity).toBe(10);
    });
  });

  describe('fAIL path quantity clamping', () => {
    it('fAIL: unqualifiedQuantity=0 → rejected by validation', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: VALID_LINKED_ISSUE,
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 0,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为不合格时，不合格数量必须大于 0');
    });

    it('fAIL: unqualifiedQuantity > totalQuantity → clamped to totalQuantity', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 5 }),
      );
      const txMock = makeTxMock({ quantity: 5, status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 5,
          result: 'FAIL',
          unqualifiedQuantity: 999,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.unqualifiedQuantity).toBe(5);
      expect(data.qualifiedQuantity).toBe(0);
      const { buildCloseLinkedIssueCreateResult } = await import(
        '~/modules/inspection/inspection-request-close-issue.service'
      );
      expect(buildCloseLinkedIssueCreateResult).toHaveBeenCalledWith(
        expect.objectContaining({ tx: txMock }),
      );
    });

    it('fAIL: unqualifiedQuantity = totalQuantity → qualified = 0', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 3 }),
      );
      const txMock = makeTxMock({ quantity: 3, status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 3,
          result: 'FAIL',
          unqualifiedQuantity: 3,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.unqualifiedQuantity).toBe(3);
      expect(data.qualifiedQuantity).toBe(0);
    });

    it('fAIL: unqualifiedQuantity = 1 (minimum) → qualified = total - 1', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 10 }),
      );
      const txMock = makeTxMock({ quantity: 10, status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 10,
          result: 'FAIL',
          unqualifiedQuantity: 1,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.unqualifiedQuantity).toBe(1);
      expect(data.qualifiedQuantity).toBe(9);
    });

    it('fAIL: missing linkedIssue → rejected by validation', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为不合格时必须填写不合格项信息');
    });

    it('fAIL: linkedIssue with empty required field → rejected', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: {
              ...VALID_LINKED_ISSUE,
              description: '',
            },
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('不合格项不合格描述不能为空');
    });

    it('fAIL: linkedIssue with whitespace-only required field → rejected', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: {
              ...VALID_LINKED_ISSUE,
              description: '   ',
            },
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('不合格项不合格描述不能为空');
    });
  });

  describe('quantity edge cases', () => {
    it('quantity=0 → normalized to 1 (Math.max(1,...))', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 1 }),
      );
      const txMock = makeTxMock({ quantity: 1, status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 0, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.qualifiedQuantity).toBe(1);
      expect(data.unqualifiedQuantity).toBe(0);
    });

    it('quantity=NaN string → falls back to request.quantity', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 5 }),
      );
      const txMock = makeTxMock({ quantity: 5, status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 'abc', result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.qualifiedQuantity).toBe(5);
      expect(data.unqualifiedQuantity).toBe(0);
    });

    it('quantity=negative → normalized to 1', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 1 }),
      );
      const txMock = makeTxMock({ quantity: 1, status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: -5, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.qualifiedQuantity).toBe(1);
      expect(data.unqualifiedQuantity).toBe(0);
    });

    it('quantity=10.7 → truncated to 10', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 10 }),
      );
      const txMock = makeTxMock({ quantity: 10, status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 10.7, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.qualifiedQuantity).toBe(10);
      expect(data.unqualifiedQuantity).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('pASS → status=CLOSED, closedAt=Date', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ status: 'INSPECTING' }),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.status).toBe('CLOSED');
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    it('fAIL → status=INSPECTING, closedAt=null', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ status: 'INSPECTING' }),
      );
      const txMock = makeTxMock({ status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 10,
          result: 'FAIL',
          unqualifiedQuantity: 2,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.status).toBe('INSPECTING');
      expect(data.closedAt).toBeNull();
    });

    it('request not found → throws NOT_FOUND', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(null);

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'not-found',
          { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
          MOCK_USER,
        ),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: '报检任务不存在',
        httpStatus: 404,
      });
    });

    it('already CLOSED → throws BAD_REQUEST', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ status: 'CLOSED' }),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
          MOCK_USER,
        ),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: '报检任务已检验完成',
      });
    });
  });

  describe('missing attachments', () => {
    it('pASS: empty attachments array → rejected', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { attachments: [], quantity: 10, result: 'PASS' },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验记录不能为空');
    });

    it('pASS: no attachments key → rejected', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { quantity: 10, result: 'PASS' },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验记录不能为空');
    });

    it('fAIL: no close attachments key → accepted when linked issue has photos', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 10,
          result: 'FAIL',
          unqualifiedQuantity: 2,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.inspectionResult).toBe('FAIL');
      expect(data.closeAttachments).toBeNull();
    });

    it('fAIL: linkedIssue without photos → rejected', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            linkedIssue: { ...VALID_LINKED_ISSUE, photos: [] },
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('不合格项照片不能为空');
    });
  });

  describe('pASS vs FAIL result field on updated record', () => {
    it('pASS sets inspectionResult=PASS on request', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.inspectionResult).toBe('PASS');
    });

    it('fAIL sets inspectionResult=FAIL on request', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'INSPECTING' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          linkedIssue: VALID_LINKED_ISSUE,
          quantity: 10,
          result: 'FAIL',
          unqualifiedQuantity: 2,
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.inspectionResult).toBe('FAIL');
    });
  });

  describe('closeRemark and closeAttachments', () => {
    it('closeRemark stored when provided', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        {
          attachments: ATTACHMENTS,
          closeRemark: 'Everything checked',
          quantity: 10,
          result: 'PASS',
        },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.closeRemark).toBe('Everything checked');
    });

    it('closeRemark=null when not provided', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { attachments: ATTACHMENTS, quantity: 10, result: 'PASS' },
        MOCK_USER,
      );

      const data = txMock.qms_inspection_requests.update.mock.calls[0][0].data;
      expect(data.closeRemark).toBeNull();
    });
  });

  describe('fAIL: linkedIssue missing multiple required fields', () => {
    it('rejects when partName and description are both empty', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: {
              ...VALID_LINKED_ISSUE,
              description: '',
              partName: '',
            },
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('不合格项组件名称不能为空');
    });

    it('rejects when linkedIssue is null', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: null,
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为不合格时必须填写不合格项信息');
    });

    it('rejects when linkedIssue is a string', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: 'some-string',
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: 2,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为不合格时必须填写不合格项信息');
    });
  });

  describe('pASS: unqualifiedQuantity with decimal value', () => {
    it('pASS with unqualifiedQuantity=0.5 → rejected (> 0)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            quantity: 10,
            result: 'PASS',
            unqualifiedQuantity: 0.5,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为合格时，不合格数量必须为 0');
    });
  });

  describe('fAIL: unqualifiedQuantity negative → rejected by validation', () => {
    it('fAIL with unqualifiedQuantity=-5 → validation rejects (clamped to 0)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ quantity: 10 }),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          {
            attachments: ATTACHMENTS,
            linkedIssue: VALID_LINKED_ISSUE,
            quantity: 10,
            result: 'FAIL',
            unqualifiedQuantity: -5,
          },
          MOCK_USER,
        ),
      ).rejects.toThrow('检验结果为不合格时，不合格数量必须大于 0');
    });
  });

  describe('concurrency guard and in-transaction record creation (P0-1/P0-2)', () => {
    const PASS_BODY = {
      attachments: ATTACHMENTS,
      quantity: 10,
      result: 'PASS',
    };

    function makeSerialConflictError() {
      return Object.assign(
        new Error(
          'Unique constraint failed on the constraint: `inspections_serialNumber_key`',
        ),
        { code: 'P2002' },
      );
    }

    it('performs an atomic status guard inside the transaction, before record creation', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { ...PASS_BODY },
        MOCK_USER,
      );

      expect(txMock.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
        data: { status: 'INSPECTING' },
        where: { id: 'req-1', isDeleted: false, status: { not: 'CLOSED' } },
      });
      const guardOrder =
        txMock.qms_inspection_requests.updateMany.mock.invocationCallOrder[0];
      const recordOrder = vi.mocked(createCloseInspectionRecords).mock
        .invocationCallOrder[0];
      expect(guardOrder).toBeLessThan(recordOrder);
    });

    it('rejects when a concurrent close wins between read and transaction (guard count=0)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest({ status: 'DISPATCHED' }),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      txMock.qms_inspection_requests.updateMany.mockResolvedValue({
        count: 0,
      });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { ...PASS_BODY },
          MOCK_USER,
        ),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: '报检任务已检验完成',
      });
      expect(createCloseInspectionRecords).not.toHaveBeenCalled();
      expect(txMock.qms_inspection_requests.update).not.toHaveBeenCalled();
      expect(syncCloseAttachments).not.toHaveBeenCalled();
    });

    it('creates close inspection records inside the transaction (tx client forwarded)', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any).mockImplementation(async (cb: any) =>
        cb(txMock),
      );

      await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { ...PASS_BODY },
        MOCK_USER,
      );

      expect(createCloseInspectionRecords).toHaveBeenCalledWith(
        expect.objectContaining({ tx: txMock }),
      );
    });

    it('retries the whole close transaction on inspection serial number conflict', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any)
        .mockRejectedValueOnce(makeSerialConflictError())
        .mockImplementationOnce(async (cb: any) => cb(txMock));

      const result = await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { ...PASS_BODY },
        MOCK_USER,
      );

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-conflict transaction failures', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      (prisma.$transaction as any).mockRejectedValue(
        new Error('DB_DOWN:connection lost'),
      );

      await expect(
        InspectionRequestCloseService.closeRequest(
          MOCK_EVENT,
          'req-1',
          { ...PASS_BODY },
          MOCK_USER,
        ),
      ).rejects.toThrow('DB_DOWN:connection lost');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(syncCloseAttachments).not.toHaveBeenCalled();
    });

    it('retries issue serial conflicts when closing with an explicit inspectionId', async () => {
      (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
        makeRequest(),
      );
      (prisma.inspections.findFirst as any).mockResolvedValue({
        id: 'insp-9',
      });
      const txMock = makeTxMock({ status: 'CLOSED' });
      (prisma.$transaction as any)
        .mockRejectedValueOnce(makeSerialConflictError())
        .mockImplementationOnce(async (cb: any) => cb(txMock));

      const result = await InspectionRequestCloseService.closeRequest(
        MOCK_EVENT,
        'req-1',
        { ...PASS_BODY, inspectionId: 'insp-9' },
        MOCK_USER,
      );

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(createCloseInspectionRecords).not.toHaveBeenCalled();
    });
  });
});
