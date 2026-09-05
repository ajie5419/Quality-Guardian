import type { AccessScope } from '~/modules/data-scope';

import type {
  InspectionListRow,
  InspectionRecordExportParams,
  InspectionRecordListParams,
  ScopedInspectionAccess,
} from './inspection-record-list-query';
import type {
  InspectionItemInput,
  InspectionTemplateMeta,
} from './inspection-record-types';

import { Prisma } from '@prisma/client';
import { formatDate, normalizeInspectionStationSelection } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { logApiWarn } from '~/utils/api-logger';
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation,
  resolveIncomingTypeName as resolveIncomingTypeNameByRelation,
  resolveIncomingTypeNamesByIds,
} from '~/utils/process-resolver';
import { parsePagination } from '~/utils/query-helpers';

import { resolveInspectionRecordTeamDisplay } from './inspection-record-display';
import { resolveLinkedInternalResponsibilities } from './inspection-record-linked-responsibility.service';
import {
  applyInspectionScope,
  buildInspectionRecordScopedWhere,
  mapInspectionListRows,
} from './inspection-record-list-query';
import {
  parseTemplateFields,
  resolveInspectionPrintHeaders,
} from './inspection-record-types';
import { resolveTemplateMetaFromAttachment } from './inspection-template-meta.service';

export const InspectionRecordQueryService = {
  async findSupplierHistory(params: {
    category: 'INCOMING' | 'PROCESS';
    dataScope?: AccessScope;
    identitySource: 'supplier' | 'team';
    page?: number;
    pageSize?: number;
    supplierId: string;
    teamIds?: string[];
    userContext?: { userId: string; username?: string };
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
    const scopedWhere = await applyInspectionScope(where, params);
    const { skip, take } = parsePagination({
      page: params.page,
      pageSize: params.pageSize,
    });
    const [items, total] = await Promise.all([
      prisma.inspections.findMany({
        where: scopedWhere,
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
      prisma.inspections.count({ where: scopedWhere }),
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
  async findById(id: string, access?: ScopedInspectionAccess) {
    const baseWhere: Prisma.inspectionsWhereInput = { id, isDeleted: false };
    const where = await applyInspectionScope(baseWhere, access ?? {});
    const inspection = await prisma.inspections.findFirst({
      where,
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

    if (!inspection) return null;

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
    params: InspectionRecordListParams,
    scopeContext?: ScopedInspectionAccess,
  ) {
    const { page = 1, pageSize = 100, sourceInspectionId } = params;
    const scopedWhere = await buildInspectionRecordScopedWhere(
      params,
      scopeContext ?? {},
    );

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

      const { skip, take } = sourceInspectionId
        ? { skip: 0, take: 1 }
        : parsePagination({ page, pageSize });
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

    let rawItems, total;
    try {
      [rawItems, total] = await runQuery(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      logApiWarn(
        'inspection-records-list',
        'Skip inspection archiveTask include: schema not ready',
      );
      [rawItems, total] = await runQuery(false);
    }

    const items = await mapInspectionListRows(rawItems as InspectionListRow[]);

    return { items, total };
  },
  async findAllForExport(
    params: InspectionRecordExportParams,
    scopeContext?: ScopedInspectionAccess,
  ) {
    const scopedWhere = await buildInspectionRecordScopedWhere(
      params,
      scopeContext ?? {},
    );

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

      // Bounded export read (PERF-QMS-001 / PHASE-1A): at most
      // EXPORT_QUERY_TAKE rows are read from the database; the caller turns
      // the N+1-th row into EXPORT_LIMIT_EXCEEDED instead of loading all rows.
      return Promise.all([
        prisma.inspections.findMany({
          where: scopedWhere,
          orderBy: { createdAt: 'desc' },
          take: EXPORT_QUERY_TAKE,
          include,
        }),
        prisma.inspections.count({ where: scopedWhere }),
      ]);
    };

    let rawItems, total;
    try {
      [rawItems, total] = await runQuery(true);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      logApiWarn(
        'inspection-records-export',
        'Skip inspection archiveTask include: schema not ready',
      );
      [rawItems, total] = await runQuery(false);
    }

    const items = await mapInspectionListRows(rawItems as InspectionListRow[]);

    return { items, total };
  },
};
