import type { quality_records_status } from '@prisma/client';
import type { InspectionIssue } from '@qgs/shared';

import type { InspectionIssueDateMode } from './inspection-issue';
import type { InspectionIssueUserContext } from './inspection-issue-access.service';

import { Prisma } from '@prisma/client';
import {
  formatDate,
  InspectionIssueStatusEnum,
  tryParsePhotos,
} from '@qgs/shared';
import { findDeptSubtree } from '~/modules/dept/dept-tree';
import { DeptService } from '~/modules/dept/dept.service';
import { toQualityRecordStatus } from '~/modules/quality-loss/quality-loss-status';
import { parseResponsibleDepartments } from '~/utils/department-multi';
import prisma from '~/utils/prisma';
import {
  buildProcessNameWhere,
  resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation,
} from '~/utils/process-resolver';

import { buildInspectionIssueDateRange } from './inspection-issue';
import { applyInspectionIssueReadOwnership } from './inspection-issue-access.service';

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

const inspectionIssueInclude = {
  process: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.quality_recordsInclude;

type InspectionIssueRecord = Prisma.quality_recordsGetPayload<{
  include: typeof inspectionIssueInclude;
}>;

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

function getResponsibleDepartmentsForResponse(issue: {
  responsibleDepartment: null | string;
  responsibleDepartments: null | string;
}): string[] {
  const responsibleDepartments = parseResponsibleDepartments(
    issue.responsibleDepartments,
  );
  if (responsibleDepartments.length > 0) {
    return responsibleDepartments;
  }
  return issue.responsibleDepartment ? [issue.responsibleDepartment] : [];
}

export function mapInspectionIssueRecord(
  issue: InspectionIssueRecord,
): InspectionIssue {
  const photos = tryParsePhotos(issue.issuePhoto as string);
  const canonicalProcessName = resolveCanonicalProcessNameByRelation(issue);
  const responsibleDepartments = getResponsibleDepartmentsForResponse(issue);

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
    responsibleDepartments,
    responsibleWelder: issue.responsibleWelder || '',
    reportedBy: issue.inspector || '',
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
}

export const InspectionIssueListService = {
  async getIssueById(params: {
    id: string;
    userContext: InspectionIssueUserContext;
  }): Promise<InspectionIssue | null> {
    const where = applyInspectionIssueReadOwnership(
      { id: params.id, isDeleted: false },
      params.userContext,
    );
    const issue = await prisma.quality_records.findFirst({
      where,
      include: inspectionIssueInclude,
    });
    return issue ? mapInspectionIssueRecord(issue) : null;
  },

  async findSupplierIssues(params: {
    category: 'INCOMING' | 'PROCESS';
    page?: number;
    pageSize?: number;
    supplierId: string;
    teamIds?: string[];
  }): Promise<{ items: InspectionIssue[]; total: number }> {
    if (params.category === 'PROCESS' && !params.teamIds?.length) {
      return { items: [], total: 0 };
    }
    const inspectionIdentity: Prisma.inspectionsWhereInput =
      params.category === 'PROCESS'
        ? {
            category: 'PROCESS',
            isDeleted: false,
            teamId: { in: params.teamIds },
          }
        : {
            category: 'INCOMING',
            isDeleted: false,
            supplierId: params.supplierId,
          };
    const where: Prisma.quality_recordsWhereInput = {
      isDeleted: false,
      OR: [
        { supplierId: params.supplierId },
        { inspection: { is: inspectionIdentity } },
      ],
    };
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const [total, issues] = await Promise.all([
      prisma.quality_records.count({ where }),
      prisma.quality_records.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: inspectionIssueInclude,
      }),
    ]);

    return {
      items: issues.map((issue) => mapInspectionIssueRecord(issue)),
      total,
    };
  },

  async getIssues(params: {
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
    userContext?: InspectionIssueUserContext;
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
      where = applyInspectionIssueReadOwnership(where, params.userContext);
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
        include: inspectionIssueInclude,
      }),
    ]);

    const items = issues.map((issue) => mapInspectionIssueRecord(issue));

    return { items, total };
  },
};
