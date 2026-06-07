import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardRouteService } from '~/modules/dashboard/dashboard-route.service';
import { InspectionService } from '~/modules/inspection';
import { WorkOrderService } from '~/modules/work-order';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement';

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getWorkspaceIssueSummary: vi.fn(),
  },
}));

vi.mock('~/modules/work-order', () => ({
  WorkOrderService: {
    countCreatedSince: vi.fn(),
    getWorkspaceWorkOrders: vi.fn(),
  },
}));

vi.mock('~/modules/work-order-requirement', () => ({
  WorkOrderRequirementService: {
    getSummaryByWorkOrderNumbers: vi.fn(),
  },
}));

describe('dashboardRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds workspace summary and sorts projects by requirements and delivery date', async () => {
    (WorkOrderService.getWorkspaceWorkOrders as any).mockResolvedValue([
      {
        createdAt: new Date('2026-06-03T08:00:00Z'),
        customerName: 'Customer A',
        deliveryDate: new Date('2026-06-20T00:00:00Z'),
        division: 'Assembly',
        projectName: 'Project A',
        status: 'COMPLETED',
        workOrderNumber: 'WO-A',
      },
      {
        createdAt: new Date('2026-06-01T08:00:00Z'),
        customerName: 'Customer B',
        deliveryDate: new Date('2026-06-10T00:00:00Z'),
        division: 'Machining',
        projectName: 'Project B',
        status: 'IN_PROGRESS',
        workOrderNumber: 'WO-B',
      },
      {
        createdAt: new Date('2026-06-02T08:00:00Z'),
        customerName: 'Customer C',
        deliveryDate: new Date('2026-06-05T00:00:00Z'),
        division: '',
        projectName: '',
        status: 'DRAFT',
        workOrderNumber: 'WO-C',
      },
    ]);
    (WorkOrderService.countCreatedSince as any).mockResolvedValue(4);
    (InspectionService.getWorkspaceIssueSummary as any).mockResolvedValue({
      openIssues: [
        {
          createdAt: new Date('2026-06-04T09:30:00Z'),
          description: 'Paint scratch',
          id: 'issue-1',
          partName: 'Panel',
          status: 'OPEN',
          workOrderNumber: 'WO-B',
        },
        {
          createdAt: null,
          description: '',
          id: 'issue-2',
          partName: 'Bracket',
          status: 'CLOSED',
          workOrderNumber: '',
        },
      ],
      openIssuesCount: 2,
      recentIssues: [
        {
          createdAt: new Date(Date.now() - 2 * 60_000),
          inspector: 'Inspector A',
          partName: 'Panel',
          status: 'OPEN',
        },
        {
          createdAt: null,
          inspector: '',
          partName: 'Bracket',
          status: 'CLOSED',
        },
      ],
      todayInspections: 7,
      todayIssues: 3,
    });
    (
      WorkOrderRequirementService.getSummaryByWorkOrderNumbers as any
    ).mockResolvedValue(
      new Map([
        [
          'WO-A',
          {
            confirmedRequirements: 2,
            overdueUnconfirmedRequirements: 1,
            plannedRequirements: 5,
          },
        ],
        [
          'WO-B',
          {
            confirmedRequirements: 1,
            overdueUnconfirmedRequirements: 0,
            plannedRequirements: 7,
          },
        ],
        [
          'WO-C',
          {
            confirmedRequirements: 1,
            overdueUnconfirmedRequirements: 3,
            plannedRequirements: 5,
          },
        ],
      ]),
    );

    const result = await DashboardRouteService.getWorkspaceSummary();

    expect(
      WorkOrderRequirementService.getSummaryByWorkOrderNumbers,
    ).toHaveBeenCalledWith(['WO-A', 'WO-B', 'WO-C']);
    expect(result.projectItems.map((item) => item.id)).toEqual([
      'WO-B',
      'WO-C',
      'WO-A',
    ]);
    expect(result.projectItems[0]).toMatchObject({
      color: '#1890ff',
      confirmedRequirements: 1,
      content: 'Project B',
      group: 'Machining',
      icon: 'lucide:clipboard-list',
      plannedRequirements: 7,
      title: 'WO-B',
      url: '/qms/work-order',
    });
    expect(result.projectItems[1]).toMatchObject({
      color: '#999',
      content: 'Customer C',
      group: '未分配',
      overdueUnconfirmedRequirements: 3,
    });
    expect(result.todoItems).toEqual([
      {
        completed: false,
        content: 'Paint scratch',
        date: expect.any(String),
        id: 'issue-1',
        title: '[WO-B] Panel',
      },
      {
        completed: true,
        content: '',
        date: '',
        id: 'issue-2',
        title: '[无工单] Bracket',
      },
    ]);
    expect(result.trendItems[0]).toMatchObject({
      avatar: 'svg:avatar-1',
      content: '创建了问题 <a>Panel</a>',
      title: 'Inspector A',
    });
    expect(result.trendItems[1]).toEqual({
      avatar: 'svg:avatar-1',
      content: '关闭了问题 <a>Bracket</a>',
      date: '',
      title: '系统',
    });
    expect(result.stats).toEqual({
      openIssuesCount: 2,
      todayInspections: 7,
      todayIssues: 3,
      todayWorkOrders: 4,
    });
  });

  it('uses default requirement summary when a work order has no requirement records', async () => {
    (WorkOrderService.getWorkspaceWorkOrders as any).mockResolvedValue([
      {
        createdAt: null,
        customerName: 'Customer A',
        deliveryDate: null,
        division: null,
        projectName: null,
        status: 'UNKNOWN',
        workOrderNumber: 'WO-A',
      },
    ]);
    (WorkOrderService.countCreatedSince as any).mockResolvedValue(1);
    (InspectionService.getWorkspaceIssueSummary as any).mockResolvedValue({
      openIssues: [],
      openIssuesCount: 0,
      recentIssues: [],
      todayInspections: 0,
      todayIssues: 0,
    });
    (
      WorkOrderRequirementService.getSummaryByWorkOrderNumbers as any
    ).mockResolvedValue(new Map());

    const result = await DashboardRouteService.getWorkspaceSummary();

    expect(result.projectItems).toEqual([
      {
        color: '#999',
        confirmedRequirements: 0,
        content: 'Customer A',
        date: '',
        group: '未分配',
        icon: 'lucide:clipboard-list',
        id: 'WO-A',
        overdueUnconfirmedRequirements: 0,
        plannedRequirements: 0,
        title: 'WO-A',
        url: '/qms/work-order',
      },
    ]);
  });
});
