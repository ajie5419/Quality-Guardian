import type { IssueItem, WeeklyReportData } from '@qgs/shared';

import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { DeptService } from './dept.service';

const logger = createModuleLogger('ReportService');
const CLOSED_TRACKING_STATUSES = [
  'CLOSED',
  'COMPLETED',
  'CONFIRMED',
  'RESOLVED',
];

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

function mapTrackingProgress(status?: null | string): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING') return '待处理';
  if (['IN_PROGRESS', 'OPEN', 'PROCESSING'].includes(normalized))
    return '进行中';
  if (CLOSED_TRACKING_STATUSES.includes(normalized)) return '已关闭';
  return '待处理';
}

async function createDepartmentNameResolver(): Promise<
  (id: null | string) => string
> {
  try {
    const deptTree = (await DeptService.findAll()) as any[];
    const deptMap = new Map<string, string>();
    const processDeptNode = (nodes: any[]) => {
      nodes.forEach((node) => {
        deptMap.set(node.id, node.name);
        if (node.children?.length) processDeptNode(node.children);
      });
    };
    processDeptNode(deptTree);
    return (id: null | string) => (id ? deptMap.get(id) || id : '-');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve department map');
    return (id: null | string) => id || '-';
  }
}

export const ReportService = {
  async getWeeklyReport(
    startDate: string,
    endDate: string,
    author?: Partial<WeeklyReportData['author']>,
  ): Promise<WeeklyReportData> {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new TypeError('Invalid startDate or endDate');
      }
      end.setHours(23, 59, 59, 999); // Ensure end of day

      // 1. Fetch Issues for "Tracking" (Last Week) - simulating logic for now
      // Ideally, this should track status changes. For now, we fetch issues closed in this period or still open.
      // Modifying scope to match user request: "Last Week Problem Tracking"
      // Detailed implementation might require specific business logic on what constitutes "tracking".
      // Here we fetch issues created before start date but still open, or closed within range.
      const trackingIssuesRaw = await prisma.quality_losses.findMany({
        where: {
          isDeleted: false,
          OR: [
            // Created before start, still open
            {
              occurDate: { lt: start },
              status: { notIn: CLOSED_TRACKING_STATUSES },
            },
            // Closed within range
            {
              updatedAt: { gte: start, lte: end },
              status: { in: CLOSED_TRACKING_STATUSES },
            },
          ],
        },
        take: 20, // Limit for safety
      });

      // 2. Fetch Internal Issues (This Week)
      const internalIssuesRaw = await prisma.quality_records.findMany({
        where: {
          isDeleted: false,
          date: { gte: start, lte: end },
          // Removed lossAmount > 0 filter to show ALL issues as requested
        },
      });

      // 3. Fetch External Issues (This Week)
      const externalIssuesRaw = await prisma.after_sales.findMany({
        where: {
          isDeleted: false,
          occurDate: { gte: start, lte: end },
        },
      });

      const getDeptName = await createDepartmentNameResolver();

      // Transform Data
      const trackingIssues = await Promise.all(
        trackingIssuesRaw.map(async (item) => ({
          id: item.id,
          type: '质量问题',
          description: item.description || '暂无描述',
          progress: mapTrackingProgress(item.status),
          completionTime: formatDate(item.updatedAt),
          respDept: getDeptName(item.respDept),
          remarks: '',
        })),
      );

      const internalIssues: IssueItem[] = await Promise.all(
        internalIssuesRaw.map(async (item) => {
          // Map severity to Chinese
          let level = '一般';
          const s = (item.severity || '').toLowerCase();
          if (
            s.includes('high') ||
            s.includes('critical') ||
            s.includes('serious') ||
            s.includes('严重')
          ) {
            level = '严重';
          }

          return {
            product: item.projectName || '-',
            description: item.description || '-',
            respDept: getDeptName(item.responsibleDepartment),
            level,
            cause: item.rootCause || item.analysis || '-',
            measures: item.solution || '-',
            closeTime:
              item.status === 'CLOSED' ? formatDate(item.updatedAt) : 'Open',
          };
        }),
      );

      const externalIssues: IssueItem[] = await Promise.all(
        externalIssuesRaw.map(async (item) => {
          // Map severity to Chinese
          let level = '严重';
          const s = (item.severity || '').toLowerCase();
          if (
            s &&
            (s.includes('low') ||
              s.includes('minor') ||
              s.includes('general') ||
              s.includes('一般') ||
              s.includes('p3') ||
              s.includes('p4'))
          ) {
            level = '一般';
          }

          let cause = item.failureCause || '-';
          if (cause === '-' && (item.defectType || item.defectSubtype)) {
            cause = [item.defectType, item.defectSubtype]
              .filter(Boolean)
              .join(' - ');
          }

          return {
            product: item.projectName || item.productType || '-',
            description: item.issueDescription || '-',
            respDept: getDeptName(item.respDept),
            level,
            cause,
            measures: item.solution || item.actualSolution || '-',
            closeTime:
              item.claimStatus === 'CLOSED' || item.claimStatus === 'COMPLETED'
                ? formatDate(item.updatedAt)
                : 'Open',
          };
        }),
      );

      return {
        title: 'Weekly Quality Report',
        period: `${startDate} ~ ${endDate}`,
        author: {
          name: author?.name || 'Unknown User',
          dept: author?.dept || '-',
          role: author?.role || '-',
          leader: author?.leader || '-',
        },
        trackingIssues,
        internalIssues,
        externalIssues,
        weeklyPlan: [], // Empty, to be filled by frontend manual input
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate weekly report');
      throw error;
    }
  },
};
