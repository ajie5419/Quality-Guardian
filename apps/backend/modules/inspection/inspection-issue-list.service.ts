import type { quality_records_status } from '@prisma/client';
import type { InspectionIssue } from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { InspectionIssueDateMode } from './inspection-issue';

import { Prisma } from '@prisma/client';
import {
  formatDate,
  InspectionIssueStatusEnum,
  tryParsePhotos,
} from '@qgs/shared';
import {
  buildProcessNameWhere,
  resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation,
} from '~/governance/master-data/process-resolver';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { findDeptSubtree } from '~/modules/dept/dept-tree';
import { DeptService } from '~/modules/dept/dept.service';
import { toQualityRecordStatus } from '~/modules/quality-loss/quality-loss-status';
import prisma from '~/utils/prisma';

import { buildInspectionIssueDateRange } from './inspection-issue';

type QualityRecordOrderField = keyof Pick<
  Prisma.quality_recordsOrderByWithRelationInput,
  | 'createdAt'
  | 'date'
  | 'inspector'
  | 'lossAmount'
  | 'nonConformanceNumber'
  | 'partName'
  | 'projectName'
  | 'quantity'
  | 'responsibleDepartment'
  | 'severity'
  | 'status'
  | 'updatedAt'
  | 'workOrderNumber'
>;

const QUALITY_RECORD_ORDER_FIELD_MAP: Record<string, QualityRecordOrderField> =
  {
    createdAt: 'createdAt',
    date: 'date',
    inspector: 'inspector',
    lossAmount: 'lossAmount',
    ncNumber: 'nonConformanceNumber',
    partName: 'partName',
    projectName: 'projectName',
    quantity: 'quantity',
    reportDate: 'date',
    reportedBy: 'inspector',
    responsibleDepartment: 'responsibleDepartment',
    severity: 'severity',
    status: 'status',
    title: 'partName',
    updatedAt: 'updatedAt',
    workOrderNumber: 'workOrderNumber',
  };

function buildQualityRecordOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc',
): Prisma.quality_recordsOrderByWithRelationInput {
  const field =
    QUALITY_RECORD_ORDER_FIELD_MAP[sortBy] ||
    QUALITY_RECORD_ORDER_FIELD_MAP.createdAt;
  return { [field]: sortOrder };
}

function normalizeQualityRecordStatusFilter(
  value: string | string[],
):
  | Prisma.Enumquality_records_statusFilter<'quality_records'>
  | quality_records_status
  | undefined {
  const values = (Array.isArray(value) ? value : [value])
    .map((item) => toQualityRecordStatus(item))
    .filter(Boolean);

  if (values.length === 0) return undefined;
  return Array.isArray(value) ? { in: values } : values[0];
}

export const InspectionIssueListService = {
  async getIssues(params: {
    dataScope?: ResolvedDataScope;
    dateMode?: InspectionIssueDateMode;
    dateValue?: string;
    defectType?: string | string[];
    page?: number;
    pageSize?: number;
    processName?: string;
    projectName?: string;
    responsibleDepartment?: string | string[];
    responsibleWelder?: string;
    severity?: string | string[];
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string | string[];
    supplierName?: string;
    userContext?: { userId: string; username?: string };
    workOrderNumber?: string;
    year?: number;
  }): Promise<{ items: InspectionIssue[]; total: number }> {
    let where: Prisma.quality_recordsWhereInput = { isDeleted: false };

    if (params.processName) {
      const processWhere = await buildProcessNameWhere(params.processName);
      where = {
        ...where,
        ...processWhere,
      };
    }

    const { start, end } = buildInspectionIssueDateRange({
      dateMode: params.dateMode,
      dateValue: params.dateValue,
      year: params.year,
    });
    where.date = {
      gte: start,
      lt: end,
    };

    if (params.projectName) {
      where.projectName = { contains: params.projectName };
    }

    if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }

    if (params.supplierName) {
      where.supplierName = { contains: params.supplierName };
    }
    if (params.responsibleWelder) {
      where.responsibleWelder = { contains: params.responsibleWelder };
    }

    // New Filters
    if (params.severity) {
      where.severity = Array.isArray(params.severity)
        ? { in: params.severity }
        : params.severity;
    }

    if (params.defectType) {
      where.defectType = Array.isArray(params.defectType)
        ? { in: params.defectType }
        : params.defectType;
    }

    if (params.status) {
      const statusFilter = normalizeQualityRecordStatusFilter(params.status);
      if (statusFilter) {
        where.status = statusFilter;
      }
    }

    if (params.responsibleDepartment) {
      const deptTree = await DeptService.findAll().catch(() => []);
      const searchTerms = (
        Array.isArray(params.responsibleDepartment)
          ? params.responsibleDepartment
          : [params.responsibleDepartment]
      )
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      const matchedDeptIds = new Set<string>();
      const matchedDeptNames = new Set<string>();
      const matchedDepts = findDeptSubtree(deptTree, (node) => {
        const nodeId = String(node.id || '');
        const nodeName = String(node.name || '');
        return searchTerms.some(
          (term) => nodeId === term || nodeName.includes(term),
        );
      });
      for (const node of matchedDepts) {
        const nodeId = String(node.id || '');
        const nodeName = String(node.name || '');
        if (nodeId) matchedDeptIds.add(nodeId);
        if (nodeName) matchedDeptNames.add(nodeName);
      }

      const exactCandidates = [
        ...new Set([...matchedDeptIds, ...matchedDeptNames, ...searchTerms]),
      ];
      let existingAndConditions: Prisma.quality_recordsWhereInput[] = [];
      if (Array.isArray(where.AND)) {
        existingAndConditions = where.AND;
      } else if (where.AND) {
        existingAndConditions = [where.AND];
      }
      const fuzzyConditions = searchTerms.map((term) => ({
        responsibleDepartment: { contains: term },
      }));
      const responsibleDepartmentConditions = [
        ...(exactCandidates.length > 0
          ? [{ responsibleDepartment: { in: exactCandidates } }]
          : []),
        ...fuzzyConditions,
      ];

      where.AND = [
        ...existingAndConditions,
        {
          OR: responsibleDepartmentConditions,
        },
      ];
    }

    if (params.userContext?.userId) {
      where = await DataScopeService.buildInspectionWhere(
        where,
        {
          userId: params.userContext.userId,
          username: params.userContext.username,
        },
        params.dataScope,
      );
    }

    const {
      page = 1,
      pageSize,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;
    const skip = pageSize && pageSize > 0 ? (page - 1) * pageSize : undefined;
    const take = pageSize && pageSize > 0 ? pageSize : undefined;

    const orderBy = buildQualityRecordOrderBy(sortBy, sortOrder);

    const [total, issues] = await Promise.all([
      prisma.quality_records.count({ where }),
      prisma.quality_records.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          process: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const items: InspectionIssue[] = issues.map((issue) => {
      const photos = tryParsePhotos(issue.issuePhoto as string);
      const canonicalProcessName = resolveCanonicalProcessNameByRelation(issue);

      return {
        ...issue,
        inspectionId: issue.inspectionId || undefined,
        ncNumber: issue.nonConformanceNumber || '',
        reportDate: formatDate(issue.date),
        date: formatDate(issue.date),
        claim: issue.isClaim ? 'Yes' : 'No',
        isClaim: issue.isClaim,
        photos,
        severity: (issue.severity as 'Critical' | 'Major' | 'Minor') || 'Minor',
        status: issue.status as InspectionIssueStatusEnum,
        lossAmount: Number(issue.lossAmount) || 0,
        responsibleDepartment: issue.responsibleDepartment || '',
        responsibleWelder: issue.responsibleWelder || '',
        reportedBy: issue.inspector || '', // Use inspector for reportedBy
        rootCause: issue.rootCause || '',
        solution: issue.solution || '',
        title: issue.partName || '',
        updatedAt: issue.updatedAt.toISOString(),
        workOrderNumber: issue.workOrderNumber || '',
        projectName: issue.projectName || '',
        quantity: issue.quantity || 0,
        inspector: issue.inspector || '',
        description: issue.description || '',
        partName: issue.partName || '',
        processName: canonicalProcessName || '',
      };
    });

    return { items, total };
  },
};
