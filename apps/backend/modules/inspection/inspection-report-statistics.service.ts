import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import {
  createIdentityAggregateItem,
  QUALITY_CLASSIFICATION_SCOPE,
} from '@qgs/shared';
import { DataScopeService, requireAnalyticsUser } from '~/modules/data-scope';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import {
  getInspectionIssueStatisticsIdentityKey,
  getInspectionIssueStatisticsSnapshotFields,
  resolveInspectionIssueStatisticsIdentity,
} from './inspection-issue-statistics-identity';

function getDisplayName(
  id: null | string,
  canonicalNames: Map<string, null | string>,
  rawName: null | string,
) {
  return createIdentityAggregateItem({
    canonicalName: id ? canonicalNames.get(id) : null,
    id,
    rawName,
    value: 0,
  }).name;
}

async function buildScopedIssueWhere(
  baseWhere: Prisma.quality_recordsWhereInput,
  access?: AnalyticsAccessContext,
): Promise<Prisma.quality_recordsWhereInput> {
  if (!access) return baseWhere;
  const user = requireAnalyticsUser(access);
  return DataScopeService.buildInspectionWhere(
    baseWhere,
    user,
    access.dataScope,
  );
}

export const InspectionReportStatisticsService = {
  async getDefectDistribution(
    yearStart: Date,
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      { date: { gte: yearStart }, isDeleted: false },
      access,
    );
    const rows = await prisma.quality_records.groupBy({
      by: [
        'defectCategoryId',
        ...getInspectionIssueStatisticsSnapshotFields('defectType'),
      ],
      where,
      _count: { id: true },
    });
    const canonicalNames =
      await QualityClassificationService.resolveCategoryNamesByIds(
        QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
        rows.map((item) => item.defectCategoryId),
      );
    const groups = new Map<
      string,
      { id: null | string; rawName: null | string; value: number }
    >();
    for (const row of rows) {
      const identity = resolveInspectionIssueStatisticsIdentity(
        'defectType',
        row,
      );
      if (!identity) continue;
      const key = getInspectionIssueStatisticsIdentityKey(identity);
      const current = groups.get(key);
      groups.set(key, {
        id: identity.id,
        rawName: current?.rawName || identity.rawName,
        value: (current?.value || 0) + row._count.id,
      });
    }
    return [...groups.values()].map((item) => ({
      type: getDisplayName(item.id, canonicalNames, item.rawName),
      value: item.value,
    }));
  },

  async getTopRiskProjects(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      { date: { gte: params.start, lte: params.end }, isDeleted: false },
      access,
    );
    const rows = await prisma.quality_records.groupBy({
      by: [
        'projectId',
        ...getInspectionIssueStatisticsSnapshotFields('projectName'),
      ],
      where,
      _count: true,
      _sum: { lossAmount: true },
    });
    const groups = new Map<
      string,
      {
        count: number;
        id: null | string;
        lossAmount: number;
        rawName: null | string;
      }
    >();
    for (const row of rows) {
      const identity = resolveInspectionIssueStatisticsIdentity(
        'projectName',
        row,
      );
      if (!identity) continue;
      const key = getInspectionIssueStatisticsIdentityKey(identity);
      const current = groups.get(key);
      groups.set(key, {
        count: (current?.count || 0) + Number(row._count || 0),
        id: identity.id,
        lossAmount:
          (current?.lossAmount || 0) + Number(row._sum.lossAmount || 0),
        rawName: current?.rawName || identity.rawName,
      });
    }
    const canonicalNames =
      await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'projectName',
        canonicalIds: [...groups.values()].map((item) => item.id),
      });
    return [...groups.values()]
      .map((item) => ({
        _count: item.count,
        _sum: { lossAmount: item.lossAmount },
        projectId: item.id,
        projectName: getDisplayName(item.id, canonicalNames, item.rawName),
      }))
      .sort((a, b) => b._sum.lossAmount - a._sum.lossAmount)
      .slice(0, 5);
  },

  async getSupplierPerformance(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    const where = await buildScopedIssueWhere(
      {
        date: { gte: params.start, lte: params.end },
        isDeleted: false,
        supplierName: { not: null },
      },
      access,
    );
    const rows = await prisma.quality_records.groupBy({
      by: [
        'supplierId',
        ...getInspectionIssueStatisticsSnapshotFields('supplierName'),
      ],
      where,
      _count: true,
    });
    const groups = new Map<
      string,
      { count: number; id: null | string; rawName: null | string }
    >();
    for (const row of rows) {
      const identity = resolveInspectionIssueStatisticsIdentity(
        'supplierName',
        row,
      );
      if (!identity) continue;
      const key = getInspectionIssueStatisticsIdentityKey(identity);
      const current = groups.get(key);
      groups.set(key, {
        count: (current?.count || 0) + Number(row._count || 0),
        id: identity.id,
        rawName: current?.rawName || identity.rawName,
      });
    }
    const canonicalNames =
      await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'supplierName',
        canonicalIds: [...groups.values()].map((item) => item.id),
      });
    return [...groups.values()].map((item) => ({
      _count: item.count,
      supplierId: item.id,
      supplierName: getDisplayName(item.id, canonicalNames, item.rawName),
    }));
  },
};
