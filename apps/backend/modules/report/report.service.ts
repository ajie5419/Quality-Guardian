import type { IssueItem, WeeklyReportData } from '@qgs/shared';

import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
  QMS_DEFAULT_VALUES,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { AfterSalesAPI } from '~/modules/after-sales';
import { DeptService } from '~/modules/dept';
import { flattenDeptTree } from '~/modules/dept/dept-tree';
import { InspectionService } from '~/modules/inspection';
import { QualityClassificationService } from '~/modules/quality-classification';
import { QualityLossService } from '~/modules/quality-loss';
import { createModuleLogger } from '~/utils/logger';

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
  const normalized = normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.CLAIMING,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  });

  if (normalized === ISSUE_TRACKING_STATUS.OPEN) return '待处理';
  if (
    normalized === ISSUE_TRACKING_STATUS.IN_PROGRESS ||
    normalized === ISSUE_TRACKING_STATUS.CLAIMING
  ) {
    return '进行中';
  }
  return '已关闭';
}

async function createDepartmentNameResolver(): Promise<
  (id: null | string) => string
> {
  try {
    const deptTree = await DeptService.findAll();
    const deptMap = new Map<string, string>();
    for (const node of flattenDeptTree(deptTree))
      deptMap.set(node.id, node.name);
    return (id: null | string) =>
      (id && deptMap.get(id)) || QMS_DEFAULT_VALUES.UNASSIGNED;
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve department map');
    return () => QMS_DEFAULT_VALUES.UNASSIGNED;
  }
}

async function resolveAfterSalesClassificationNames(
  rows: Awaited<ReturnType<typeof AfterSalesAPI.getWeeklyReportIssues>>,
) {
  const [productCategories, defectCategories, defectSubcategories] =
    await Promise.all([
      QualityClassificationService.resolveCategoryNamesByIds(
        QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
        rows.map((item) => item.productCategoryId || ''),
      ),
      QualityClassificationService.resolveCategoryNamesByIds(
        QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
        rows.map((item) => item.defectCategoryId || ''),
      ),
      QualityClassificationService.resolveSubcategoryNamesByIds(
        QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
        rows.map((item) => item.defectSubcategoryId || ''),
      ),
    ]);
  return { defectCategories, defectSubcategories, productCategories };
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
      const trackingIssuesRaw =
        await QualityLossService.getWeeklyTrackingIssues({
          closedStatuses: CLOSED_TRACKING_STATUSES,
          end,
          start,
          take: 20,
        });

      // 2. Fetch Internal Issues (This Week)
      const internalIssuesRaw = await InspectionService.getWeeklyReportIssues({
        end,
        start,
      });

      // 3. Fetch External Issues (This Week)
      const externalIssuesRaw = await AfterSalesAPI.getWeeklyReportIssues({
        end,
        start,
      });

      const [getDeptName, afterSalesClassificationNames] = await Promise.all([
        createDepartmentNameResolver(),
        resolveAfterSalesClassificationNames(externalIssuesRaw),
      ]);

      // Transform Data
      const trackingIssues = await Promise.all(
        trackingIssuesRaw.map(async (item) => ({
          id: item.id,
          type: '质量问题',
          description: item.description || '暂无描述',
          progress: mapTrackingProgress(item.status),
          completionTime: formatDate(item.updatedAt),
          respDept: getDeptName(item.respDeptId),
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
            respDept: getDeptName(item.responsibleDepartmentId),
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
          const defectCategoryName = item.defectCategoryId
            ? afterSalesClassificationNames.defectCategories.get(
                item.defectCategoryId,
              )
            : null;
          const defectSubcategoryName = item.defectSubcategoryId
            ? afterSalesClassificationNames.defectSubcategories.get(
                item.defectSubcategoryId,
              )
            : null;
          if (cause === '-' && (defectCategoryName || defectSubcategoryName)) {
            cause = [defectCategoryName, defectSubcategoryName]
              .filter(Boolean)
              .join(' - ');
          }
          const productCategoryName = item.productCategoryId
            ? afterSalesClassificationNames.productCategories.get(
                item.productCategoryId,
              )
            : null;

          return {
            product: item.projectName || productCategoryName || '-',
            description: item.issueDescription || '-',
            respDept: getDeptName(item.respDeptId),
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
