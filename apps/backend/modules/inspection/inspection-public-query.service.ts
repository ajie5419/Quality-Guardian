import { INSPECTION_REQUEST_STATUS, SUPPLIER_CATEGORY } from '@qgs/shared';
import { INCOMING_INSPECTION_PROCESS_NAME } from '~/modules/inspection/inspection-request';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { parseWorkOrderListQuery } from '~/modules/work-order/work-order-query';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';

const logger = createModuleLogger('inspection-public-query');

function maskReporter(value: null | string | undefined): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const first = text[0] ?? '';
  return text.length === 1 ? first : `${first}*`;
}

function parseIncomingRequestInfo(value: null | string | undefined): {
  incomingType: string;
  notes: string;
} {
  if (!value) return { incomingType: '', notes: '' };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      incomingType: String(parsed.incomingType ?? '').trim(),
      notes: String(parsed.notes ?? '').trim(),
    };
  } catch (error) {
    logger.warn({ err: error }, 'failed to parse requestInfo json');
    return { incomingType: '', notes: '' };
  }
}

function toItem(record: {
  closedAt: Date | null;
  inspectionResult: string;
  partName: string;
  qualifiedQuantity: null | number;
  quantity: number;
  reporter: string;
  requestInfo: null | string;
  requestNo: string;
  status: string;
  submittedAt: Date;
  team: null | string;
  unqualifiedQuantity: null | number;
  workOrderNumber: string;
}) {
  const info = parseIncomingRequestInfo(record.requestInfo);
  return {
    requestNo: record.requestNo,
    partName: record.partName,
    supplierName: record.team ?? '',
    workOrderNumber: record.workOrderNumber,
    quantity: record.quantity,
    qualifiedQuantity: record.qualifiedQuantity,
    unqualifiedQuantity: record.unqualifiedQuantity,
    reporter: maskReporter(record.reporter),
    status: record.status,
    inspectionResult: record.inspectionResult,
    incomingType: info.incomingType,
    notes: info.notes,
    submittedAt: record.submittedAt.toISOString(),
    closedAt: record.closedAt ? record.closedAt.toISOString() : null,
  };
}

export const InspectionPublicQueryService = {
  async getPublicProcesses(_workOrderNumber: string) {
    const processes = await prisma.processes.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: { id: true, inspectionRequestCategory: true, name: true },
    });
    return processes.map((item) => ({
      category: item.inspectionRequestCategory,
      processId: item.id,
      processName: item.name,
    }));
  },

  async getPublicBomParts(workOrderNumber: string) {
    const list = await prisma.project_boms.findMany({
      where: { work_order_number: workOrderNumber },
      orderBy: [{ part_number: 'asc' }, { created_at: 'desc' }],
      select: {
        id: true,
        partId: true,
        part_name: true,
        part_number: true,
        work_order_number: true,
      },
    });
    return list.map((item) => ({
      id: item.id,
      partId: item.partId,
      partName: item.part_name,
      partNumber: item.part_number,
      workOrderNumber: item.work_order_number,
    }));
  },

  async getPublicTeams(keyword: string) {
    return SupplierIdentityService.listTeamOptions(keyword);
  },

  async getPublicSuppliers(keyword: string, category: string) {
    const normalizedKeyword = keyword.trim();
    const normalizedCategory = category.trim() || SUPPLIER_CATEGORY.SUPPLIER;
    const suppliers = await prisma.suppliers.findMany({
      where: {
        category: normalizedCategory,
        isDeleted: false,
        ...(normalizedKeyword ? { name: { contains: normalizedKeyword } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true },
    });
    return suppliers.map((item) => ({
      label: item.name,
      value: item.id,
    }));
  },

  async getPublicWorkOrders(query: Record<string, unknown>) {
    const params = parseWorkOrderListQuery({
      ...query,
      ignoreYearFilter: true,
      pageSize: query.pageSize || 20,
    });
    const where: Record<string, unknown> = { isDeleted: false };
    const keywordOr = buildKeywordOr(params.keyword, [
      'workOrderNumber',
      'projectName',
    ] as const);
    if (keywordOr) {
      Object.assign(where, keywordOr);
    } else if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }
    const [items, total] = await Promise.all([
      prisma.work_orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          division: true,
          divisionId: true,
          multiStationEnabled: true,
          projectName: true,
          quantity: true,
          status: true,
          workOrderNumber: true,
        },
      }),
      prisma.work_orders.count({ where }),
    ]);
    const divisionIds = [
      ...new Set(
        items
          .map((item) => String(item.divisionId || '').trim())
          .filter((item) => item.startsWith('dept-')),
      ),
    ];
    const departments =
      divisionIds.length > 0
        ? await prisma.departments.findMany({
            where: { id: { in: divisionIds }, isDeleted: false },
            select: { id: true, name: true },
          })
        : [];
    const departmentNameById = new Map(
      departments.map((item) => [item.id, item.name]),
    );
    return {
      items: items.map((item) => {
        const division =
          departmentNameById.get(String(item.divisionId || '')) ||
          item.division ||
          null;
        return {
          createTime: null,
          customerName: null,
          deliveryDate: null,
          division,
          id: item.workOrderNumber,
          multiStationEnabled: Boolean(item.multiStationEnabled),
          projectName: item.projectName || null,
          quantity: item.quantity || 0,
          status: item.status,
          workOrderNumber: item.workOrderNumber,
        };
      }),
      total,
    };
  },

  async getTodayIncomingInspections() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const TAKE_LIMIT = 200;
    const records = await prisma.qms_inspection_requests.findMany({
      where: {
        AND: [
          {
            OR: [
              { category: 'INCOMING' },
              {
                category: null,
                processName: INCOMING_INSPECTION_PROCESS_NAME,
              },
            ],
          },
          {
            OR: [
              {
                status: {
                  in: [
                    INSPECTION_REQUEST_STATUS.SUBMITTED,
                    INSPECTION_REQUEST_STATUS.DISPATCHED,
                    INSPECTION_REQUEST_STATUS.INSPECTING,
                  ],
                },
              },
              {
                status: INSPECTION_REQUEST_STATUS.CLOSED,
                closedAt: { gte: start, lt: end },
              },
            ],
          },
        ],
        isDeleted: false,
      },
      orderBy: { submittedAt: 'desc' },
      take: TAKE_LIMIT,
      select: {
        requestNo: true,
        partName: true,
        team: true,
        workOrderNumber: true,
        quantity: true,
        qualifiedQuantity: true,
        unqualifiedQuantity: true,
        reporter: true,
        status: true,
        inspectionResult: true,
        requestInfo: true,
        submittedAt: true,
        closedAt: true,
      },
    });

    const pendingItems: Array<ReturnType<typeof toItem>> = [];
    const passItems: Array<ReturnType<typeof toItem>> = [];
    const failItems: Array<ReturnType<typeof toItem>> = [];
    const conditionalItems: Array<ReturnType<typeof toItem>> = [];

    for (const record of records) {
      const status = String(record.status);
      const result = String(record.inspectionResult);
      const item = toItem({
        ...record,
        status,
        inspectionResult: result,
      });
      if (result === 'FAIL') {
        failItems.push(item);
      } else if (status === INSPECTION_REQUEST_STATUS.CLOSED) {
        if (result === 'CONDITIONAL') conditionalItems.push(item);
        else passItems.push(item);
      } else if (
        status === INSPECTION_REQUEST_STATUS.SUBMITTED ||
        status === INSPECTION_REQUEST_STATUS.DISPATCHED ||
        status === INSPECTION_REQUEST_STATUS.INSPECTING
      ) {
        pendingItems.push(item);
      }
    }

    return {
      summary: {
        pending: pendingItems.length,
        pass: passItems.length,
        fail: failItems.length,
        conditional: conditionalItems.length,
        total: records.length,
      },
      pendingItems,
      passItems,
      failItems,
      conditionalItems,
      generatedAt: new Date().toISOString(),
      dateLabel: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      truncated: records.length === TAKE_LIMIT,
    };
  },
};
