import type { IssueItem, WeeklyReportData } from '@qgs/shared';

import {
  createIdentityAggregateItem,
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
  QMS_DEFAULT_VALUES,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { AfterSalesAPI } from '~/modules/after-sales';
import { DeptService } from '~/modules/dept';
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

function createDepartmentNameResolver(
  departmentNames: ReadonlyMap<string, string>,
) {
  return (id: null | string, rawName?: null | string) =>
    createIdentityAggregateItem({
      canonicalName: id ? departmentNames.get(id) : null,
      id,
      missingName: rawName ? undefined : QMS_DEFAULT_VALUES.UNASSIGNED,
      rawName,
      value: 0,
    }).name;
}

function resolveGovernedDisplayName(
  id: null | string,
  canonicalNames: Map<string, null | string>,
  rawName?: null | string,
) {
  if (!id && !rawName) return null;
  return createIdentityAggregateItem({
    canonicalName: id ? canonicalNames.get(id) : null,
    id,
    rawName,
    value: 0,
  }).name;
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

      const departmentNames = await DeptService.resolveActiveNamesByIds([
        ...trackingIssuesRaw.map((item) => item.respDeptId),
        ...internalIssuesRaw.map((item) => item.responsibleDepartmentId),
        ...externalIssuesRaw.map((item) => item.respDeptId),
      ]);
      const afterSalesClassificationNames =
        await resolveAfterSalesClassificationNames(externalIssuesRaw);
      const getDeptName = createDepartmentNameResolver(departmentNames);

      // Transform Data
      const trackingIssues = await Promise.all(
        trackingIssuesRaw.map(async (item) => ({
          id: item.id,
          type: '质量问题',
          description: item.description || '暂无描述',
          progress: mapTrackingProgress(item.status),
          completionTime: formatDate(item.updatedAt),
          respDept: getDeptName(item.respDeptId, item.respDept),
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
            respDept: getDeptName(
              item.responsibleDepartmentId,
              item.responsibleDepartment,
            ),
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
          const defectCategoryName = resolveGovernedDisplayName(
            item.defectCategoryId,
            afterSalesClassificationNames.defectCategories,
            item.defectType,
          );
          const defectSubcategoryName = resolveGovernedDisplayName(
            item.defectSubcategoryId,
            afterSalesClassificationNames.defectSubcategories,
            item.defectSubtype,
          );
          if (cause === '-' && (defectCategoryName || defectSubcategoryName)) {
            cause = [defectCategoryName, defectSubcategoryName]
              .filter(Boolean)
              .join(' - ');
          }
          const productCategoryName = resolveGovernedDisplayName(
            item.productCategoryId,
            afterSalesClassificationNames.productCategories,
            item.productType,
          );

          return {
            product: item.projectName || productCategoryName || '-',
            description: item.issueDescription || '-',
            respDept: getDeptName(item.respDeptId, item.respDept),
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
