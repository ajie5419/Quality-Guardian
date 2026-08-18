import type { ResolvedDataScope } from '~/modules/data-scope';

import type {
  InspectionItemInput,
  InspectionTemplateMeta,
} from './inspection-record-types';

import { Prisma } from '@prisma/client';
import {
  buildInspectionRecordDateRange,
  formatDate,
  normalizeInspectionStationSelection,
} from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope';
import { DeptService } from '~/modules/dept';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation,
  resolveIncomingTypeName as resolveIncomingTypeNameByRelation,
  resolveIncomingTypeNamesByIds,
} from '~/utils/process-resolver';
import {
  buildKeywordOr,
  buildYearFilter,
  parsePagination,
} from '~/utils/query-helpers';

import { resolveInspectionRecordTeamDisplay } from './inspection-record-display';
import {
  resolveLinkedInternalResponsibilities,
  resolveUniqueLinkedInternalInspectionIdsForTeam,
} from './inspection-record-linked-responsibility.service';
import {
  deriveInspectionIssueStatus,
  normalizeInspectionCategory,
  parseTemplateFields,
  resolveInspectionPrintHeaders,
} from './inspection-record-types';
import { resolveTemplateMetaFromAttachment } from './inspection-template-meta.service';

const logger = createModuleLogger('InspectionService');

export const InspectionRecordQueryService = {
  async findSupplierHistory(params: {
    category: 'INCOMING' | 'PROCESS';
    identitySource: 'supplier' | 'team';
    page?: number;
    pageSize?: number;
    supplierId: string;
    teamIds?: string[];
  }) {
    if (params.identitySource === 'team' && !params.teamIds?.length) {
      return { items: [], total: 0 };
    }
    const where: Prisma.inspectionsWhereInput = {
      category: params.category,
      isDeleted: false,
      ...(params.identitySource === 'supplier'
        ? { supplierId: params.supplierId }
        : { teamId: { in: params.teamIds } }),
    };
    const { skip, take } = parsePagination({
      page: params.page,
      pageSize: params.pageSize,
    });
    const [items, total] = await Promise.all([
      prisma.inspections.findMany({
        where,
        skip,
        take,
        orderBy: [{ inspectionDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          process: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.inspections.count({ where }),
    ]);
    const incomingTypeNameById = await resolveIncomingTypeNamesByIds(
      items.map((item) =>
        item.category === 'INCOMING' ? item.incomingTypeId : null,
      ),
    );

    return {
      items: items.map((item) => ({
        ...item,
        incomingType:
          item.category === 'INCOMING'
            ? incomingTypeNameById.get(item.incomingTypeId || '') ||
              item.incomingType ||
              null
            : item.incomingType,
        partName:
          params.category === 'INCOMING'
            ? item.materialName || item.level1Component
            : item.level1Component || item.materialName,
        processName: resolveCanonicalProcessNameByRelation(item),
      })),
      total,
    };
  },
  async findById(id: string) {
    const inspection = await prisma.inspections.findFirst({
      where: {
        id,
        isDeleted: false,
      },
      include: {
        items: {
          orderBy: [{ order: 'asc' }],
        },
        process: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!inspection) {
      return null;
    }

    const [linkedResponsibilityByInspectionId, departmentNames] =
      await Promise.all([
        resolveLinkedInternalResponsibilities([inspection]),
        DeptService.resolveActiveNamesByIds([
          inspection.responsibleDepartmentId,
        ]),
      ]);

    let templateFields: InspectionItemInput[] = [];
    let templateMeta: InspectionTemplateMeta = {
      drawingNo: null,
      formNo: null,
    };
    if (inspection.templateId) {
      const template = await prisma.inspection_form_templates.findUnique({
        where: { id: inspection.templateId },
        select: {
          attachments: true,
          drawingNo: true,
          formFields: true,
          formNo: true,
        },
      });
      templateFields = parseTemplateFields(template?.formFields);
      templateMeta = {
        drawingNo: String(template?.drawingNo || '').trim() || null,
        formNo: String(template?.formNo || '').trim() || null,
      };
      if (!templateMeta.formNo || !templateMeta.drawingNo) {
        const attachmentMeta = await resolveTemplateMetaFromAttachment(
          template?.attachments,
        );
        templateMeta = {
          drawingNo: templateMeta.drawingNo || attachmentMeta.drawingNo,
          formNo: templateMeta.formNo || attachmentMeta.formNo,
        };
      }
    }

    const printHeaders = resolveInspectionPrintHeaders(
      templateFields,
      inspection.items || [],
    );

    return {
      ...inspection,
      drawingNo: templateMeta.drawingNo,
      formNo: templateMeta.formNo,
      inspectionDate: formatDate(inspection.inspectionDate),
      incomingType:
        inspection.category === 'INCOMING'
          ? await resolveIncomingTypeNameByRelation(inspection)
          : inspection.incomingType,
      processName: resolveCanonicalProcessNameByRelation(inspection),
      printHeaders,
      reportDate: inspection.reportDate
        ? formatDate(inspection.reportDate)
        : null,
      stationSelection: normalizeInspectionStationSelection(
        inspection.stationSelection,
      ),
      team: resolveInspectionRecordTeamDisplay({
        ...inspection,
        responsibleDepartment:
          departmentNames.get(inspection.responsibleDepartmentId || '') ||
          inspection.responsibleDepartment,
        ...linkedResponsibilityByInspectionId.get(inspection.id),
      }),
    };
  },
  async findAll(
    params: {
      componentName?: string;
      endDate?: string;
      forExport?: boolean;
      hasDocuments?: boolean;
      inspector?: string;
      keyword?: string;
      level1Component?: string;
      materialName?: string;
      page?: number;
      pageSize?: number;
      processName?: string;
      projectName?: string;
      sourceInspectionId?: string;
      startDate?: string;
      supplierName?: string;
      team?: string;
      type?: string;
      workOrderNumber?: string;
      year?: number;
    },
    scopeContext?: {
      scope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
      user?: { id: number | string; username: string };
    },
  ) {
    const {
      page = 1,
      pageSize = 100,
      type = 'INCOMING',
      forExport = false,
      year,
      hasDocuments,
      componentName,
      endDate,
      inspector,
      keyword,
      level1Component,
      materialName,
      processName,
      projectName,
      sourceInspectionId,
      startDate,
      supplierName,
      team,
      workOrderNumber,
    } = params;

    // Build Where Clause
    const where: Prisma.inspectionsWhereInput = {
      isDeleted: false,
    };
    const [linkedInternalInspectionIds, currentTeamDepartments] = team
      ? await Promise.all([
          resolveUniqueLinkedInternalInspectionIdsForTeam(team),
          DeptService.findActiveByNameContains(team),
        ])
      : [[], []];

    if (sourceInspectionId) {
      where.id = sourceInspectionId;
    } else {
      if (type !== 'ALL') {
        const category = normalizeInspectionCategory(type);
        if (category) {
          where.category = category;
        }
      }

      if (workOrderNumber) where.workOrderNumber = workOrderNumber;
      if (supplierName) where.supplierName = { contains: supplierName };
      if (typeof hasDocuments === 'boolean') where.hasDocuments = hasDocuments;
      if (processName) where.processName = { contains: processName };
      if (level1Component)
        where.level1Component = { contains: level1Component };
      if (componentName) where.level2Component = { contains: componentName };
      if (materialName) where.materialName = { contains: materialName };
      const additionalFilters: Prisma.inspectionsWhereInput[] = [];
      if (team) {
        const currentTeamDepartmentFilters: Prisma.inspectionsWhereInput[] =
          currentTeamDepartments.length > 0
            ? [
                {
                  category: 'PROCESS',
                  responsibilityType: 'INTERNAL_DEPARTMENT',
                  responsibleDepartmentId: {
                    in: currentTeamDepartments.map(
                      (department) => department.id,
                    ),
                  },
                },
              ]
            : [];
        additionalFilters.push({
          OR: [
            { team: { contains: team } },
            {
              category: 'PROCESS',
              responsibilityType: 'INTERNAL_DEPARTMENT',
              responsibleDepartment: { contains: team },
            },
            ...currentTeamDepartmentFilters,
            {
              category: 'PROCESS',
              responsibilityType: 'OUTSOURCING_UNIT',
              supplierName: { contains: team },
            },
            {
              AND: [
                { category: 'PROCESS' },
                {
                  OR: [
                    { responsibilityType: null },
                    { responsibilityType: 'INTERNAL_DEPARTMENT' },
                  ],
                },
                {
                  OR: [
                    { responsibleDepartment: null },
                    { responsibleDepartment: '' },
                  ],
                },
                { id: { in: linkedInternalInspectionIds } },
              ],
            },
          ],
        });
      }
      if (inspector) where.inspector = { contains: inspector };
      if (projectName) where.projectName = { contains: projectName };

      const keywordOr = buildKeywordOr(keyword, [
        'workOrderNumber',
        'projectName',
        'supplierName',
        'inspector',
      ] as const);
      if (keywordOr) additionalFilters.push(keywordOr);
      if (additionalFilters.length > 0) where.AND = additionalFilters;

      const explicitDateRange = buildInspectionRecordDateRange({
        endDate,
        startDate,
      });
      if (explicitDateRange) {
        where.inspectionDate = {
          gte: explicitDateRange.start,
          lt: explicitDateRange.end,
        };
      } else if (year) {
        where.inspectionDate = buildYearFilter(year);
      }
    }

    let scopedWhere: Prisma.inspectionsWhereInput = where;
    if (scopeContext?.scope && scopeContext.user) {
      scopedWhere = await DataScopeService.buildScopedWhere(
        'inspection',
        where,
        {
          userId: String(scopeContext.user.id),
          username: scopeContext.user.username,
        },
        scopeContext.scope,
      );
    }

    const runQuery = async (withArchiveTask: boolean) => {
      const include = {
        ...(withArchiveTask
          ? {
              archiveTask: {
                select: {
                  dueAt: true,
                  id: true,
                  isOverdue: true,
                  status: true,
                },
              },
            }
          : {}),
        items: true,
        process: {
          select: {
            name: true,
          },
        },
        qualityRecords: {
          select: {
            quantity: true,
            status: true,
          },
          where: { isDeleted: false },
        },
      } as const;

      if (forExport) {
        return Promise.all([
          prisma.inspections.findMany({
            where: scopedWhere,
            orderBy: { createdAt: 'desc' },
            include,
          }),
          prisma.inspections.count({ where: scopedWhere }),
        ]);
      }

      const { skip, take } = sourceInspectionId
        ? { skip: 0, take: 1 }
        : parsePagination({
            page,
            pageSize,
          });
      return Promise.all([
        prisma.inspections.findMany({
          where: scopedWhere,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include,
        }),
        prisma.inspections.count({ where: scopedWhere }),
      ]);
    };

    let rawItems;
    let total;
    try {
      [rawItems, total] = await runQuery(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) {
        throw error;
      }
      logger.warn('Skip inspection archiveTask include: schema not ready');
      [rawItems, total] = await runQuery(false);
    }

    const incomingTypeNameById = await resolveIncomingTypeNamesByIds(
      rawItems.map((item) =>
        item.category === 'INCOMING' ? item.incomingTypeId : null,
      ),
    );
    const [linkedResponsibilityByInspectionId, departmentNames] =
      await Promise.all([
        resolveLinkedInternalResponsibilities(rawItems),
        DeptService.resolveActiveNamesByIds(
          rawItems.map((item) => item.responsibleDepartmentId),
        ),
      ]);
    const items = rawItems.map((item) => {
      const linkedIssues = item.qualityRecords || [];
      const fallbackUnqualifiedQuantity = linkedIssues.reduce(
        (sum, issue) => sum + Number(issue.quantity || 0),
        0,
      );
      const unqualifiedQuantity =
        item.unqualifiedQuantity === null ||
        item.unqualifiedQuantity === undefined
          ? fallbackUnqualifiedQuantity
          : Number(item.unqualifiedQuantity || 0);

      return {
        ...item,
        incomingType:
          item.category === 'INCOMING'
            ? incomingTypeNameById.get(item.incomingTypeId || '') ||
              item.incomingType ||
              null
            : item.incomingType,
        archiveDueAt: item.archiveTask?.dueAt || null,
        archiveTaskId: item.archiveTask?.id || null,
        archiveIsOverdue: Boolean(item.archiveTask?.isOverdue),
        archiveTaskStatus: item.archiveTask?.status || null,
        issueStatus: deriveInspectionIssueStatus(linkedIssues),
        processName: resolveCanonicalProcessNameByRelation(item),
        qualifiedQuantity:
          item.qualifiedQuantity === null ||
          item.qualifiedQuantity === undefined
            ? Math.max(0, Number(item.quantity || 1) - unqualifiedQuantity)
            : Number(item.qualifiedQuantity || 0),
        unqualifiedQuantity,
        stationSelection: normalizeInspectionStationSelection(
          item.stationSelection,
        ),
        team: resolveInspectionRecordTeamDisplay({
          ...item,
          responsibleDepartment:
            departmentNames.get(item.responsibleDepartmentId || '') ||
            item.responsibleDepartment,
          ...linkedResponsibilityByInspectionId.get(item.id),
        }),
      };
    });

    return { items, total };
  },
};
