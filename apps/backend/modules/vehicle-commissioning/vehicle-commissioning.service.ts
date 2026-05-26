import type {
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueParams,
} from '@qgs/shared';

import { ISSUE_TRACKING_STATUS, safeNumber } from '@qgs/shared';
import { nanoid } from 'nanoid';
import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

import { VehicleCommissioningDailyReportService } from './vehicle-commissioning-daily-report.service';
import { exportVehicleCommissioningIssuesWorkbook } from './vehicle-commissioning-export.service';
import {
  mapVehicleCommissioningIssueToDto,
  normalizeVehicleCommissioningPhotos,
  parseVehicleCommissioningIssueStatus,
} from './vehicle-commissioning-issue-format';

export const VehicleCommissioningService = {
  async findIssueId(id: string) {
    const row = await prisma.vehicle_commissioning_issues.findFirst({
      where: { id },
      select: { id: true },
    });
    return row?.id || null;
  },

  async updateQualityLossFields(params: {
    actualClaim?: number;
    amount?: number;
    id: string;
    status?: string;
  }) {
    await prisma.vehicle_commissioning_issues.update({
      where: { id: params.id },
      data: {
        ...(params.amount === undefined ? {} : { lossAmount: params.amount }),
        ...(params.actualClaim === undefined
          ? {}
          : { recoveredAmount: params.actualClaim }),
        ...(params.status ? { claimStatus: params.status } : {}),
        updatedAt: new Date(),
      },
    });
  },

  async getQualityLossTrendRows(params: {
    granularity: 'month' | 'week';
    year: number;
  }) {
    return params.granularity === 'week'
      ? prisma.$queryRaw<
          Array<{ a: bigint | null | number; p: bigint | number }>
        >`SELECT WEEK(date, 3) as p, SUM(IFNULL(lossAmount, 0)) as a FROM vehicle_commissioning_issues WHERE YEAR(date) = ${params.year} AND isDeleted = 0 AND (isClaim = 1 OR IFNULL(lossAmount, 0) > 0) GROUP BY p`
      : prisma.$queryRaw<
          Array<{ a: bigint | null | number; p: bigint | number }>
        >`SELECT MONTH(date) as p, SUM(IFNULL(lossAmount, 0)) as a FROM vehicle_commissioning_issues WHERE YEAR(date) = ${params.year} AND isDeleted = 0 AND (isClaim = 1 OR IFNULL(lossAmount, 0) > 0) GROUP BY p`;
  },

  async getLossRecordsForAggregation(params?: {
    skip?: number;
    take?: number;
    workOrderNumber?: string;
  }) {
    return prisma.vehicle_commissioning_issues.findMany({
      where: {
        isDeleted: false,
        OR: [{ isClaim: true }, { lossAmount: { gt: 0 } }],
        ...(params?.workOrderNumber
          ? { workOrderNumber: { contains: params.workOrderNumber } }
          : {}),
      },
      orderBy: { date: 'desc' },
      ...(params?.skip === undefined ? {} : { skip: params.skip }),
      ...(params?.take === undefined ? {} : { take: params.take }),
    });
  },

  async countLossRecordsForAggregation(params?: { workOrderNumber?: string }) {
    return prisma.vehicle_commissioning_issues.count({
      where: {
        isDeleted: false,
        OR: [{ isClaim: true }, { lossAmount: { gt: 0 } }],
        ...(params?.workOrderNumber
          ? { workOrderNumber: { contains: params.workOrderNumber } }
          : {}),
      },
    });
  },

  async getQualityLossDrillDownRecords(params: {
    end: Date;
    start: Date;
    take?: number;
  }) {
    return prisma.vehicle_commissioning_issues.findMany({
      where: {
        isDeleted: false,
        date: { gte: params.start, lte: params.end },
        OR: [{ isClaim: true }, { lossAmount: { gt: 0 } }],
      },
      orderBy: { date: 'desc' },
      take: params.take || 500,
    });
  },

  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    const baseWhere = {
      isDeleted: false,
      OR: [{ isClaim: true }, { lossAmount: { gt: 0 } }],
    };
    const [yearAggregate, weekAggregate, weekCount] = await Promise.all([
      prisma.vehicle_commissioning_issues.aggregate({
        where: { ...baseWhere, date: { gte: params.yearStart } },
        _count: { id: true },
        _sum: { lossAmount: true },
      }),
      prisma.vehicle_commissioning_issues.aggregate({
        where: { ...baseWhere, date: { gte: params.weekStart } },
        _sum: { lossAmount: true },
      }),
      prisma.vehicle_commissioning_issues.count({
        where: { ...baseWhere, date: { gte: params.weekStart } },
      }),
    ]);

    return {
      totalCount: yearAggregate._count.id || 0,
      weeklyCount: weekCount || 0,
      totalLoss: Number(yearAggregate._sum.lossAmount || 0),
      weeklyLoss: Number(weekAggregate._sum.lossAmount || 0),
    };
  },

  async createIssueFromBody(
    body: Record<string, unknown>,
    operatorUserId?: string,
  ) {
    const photos = Array.isArray(body.photos)
      ? body.photos.map(String).filter(Boolean)
      : [];
    const toNumber = (value: unknown) => {
      if (value === undefined || value === null || value === '')
        return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const created = await this.createIssue(
      {
        assignee: body.assignee ? String(body.assignee) : undefined,
        date: body.date ? String(body.date) : undefined,
        description: body.description ? String(body.description) : undefined,
        isClaim:
          body.isClaim === undefined
            ? undefined
            : ['1', 'true', 'yes', '是'].includes(
                String(body.isClaim).toLowerCase(),
              ),
        lossAmount: toNumber(body.lossAmount),
        partName: body.partName ? String(body.partName) : undefined,
        photos,
        projectName: body.projectName ? String(body.projectName) : undefined,
        recoveredAmount: toNumber(body.recoveredAmount),
        ...buildGovernedWriteFieldsForTable('vehicle_commissioning_issues', {
          responsibleDepartment: body.responsibleDepartment
            ? String(body.responsibleDepartment)
            : undefined,
        }),
        claimNotes: body.claimNotes ? String(body.claimNotes) : undefined,
        claimStatus: body.claimStatus ? String(body.claimStatus) : undefined,
        severity: body.severity ? String(body.severity) : undefined,
        solution: body.solution ? String(body.solution) : undefined,
        status: body.status
          ? parseVehicleCommissioningIssueStatus(body.status)
          : undefined,
        title: body.title ? String(body.title) : undefined,
        workOrderNumber: body.workOrderNumber
          ? String(body.workOrderNumber)
          : undefined,
      },
      operatorUserId,
    );
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: photos,
        bizId: String(created.id),
        bizType: 'vehicle_commissioning_issue',
        fieldName: 'photos',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
    }
    return created;
  },
  async exportIssuesWorkbook(params: VehicleCommissioningIssueParams) {
    return exportVehicleCommissioningIssuesWorkbook(this, params);
  },

  async createDailyReport(payload: VehicleCommissioningDailyReportPayload) {
    return VehicleCommissioningDailyReportService.createDailyReport(payload);
  },

  async createIssue(
    payload: Partial<VehicleCommissioningIssue>,
    operatorUserId?: string,
  ) {
    const now = new Date();
    const status = parseVehicleCommissioningIssueStatus(payload.status);
    const governedFields = buildGovernedWriteFieldsForTable(
      'vehicle_commissioning_issues',
      {
        responsibleDepartment: payload.responsibleDepartment || '调试组',
      },
    );
    const row = await prisma.vehicle_commissioning_issues.create({
      data: {
        id: `DA-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`,
        date: payload.date ? new Date(payload.date) : now,
        status,
        closedAt: status === ISSUE_TRACKING_STATUS.CLOSED ? now : null,
        partName: payload.partName || '车辆总成',
        description: payload.description || payload.title || '',
        issuePhoto: normalizeVehicleCommissioningPhotos(payload.photos),
        isClaim: Boolean(payload.isClaim),
        lossAmount: safeNumber(payload.lossAmount),
        recoveredAmount: safeNumber(payload.recoveredAmount),
        claimStatus: payload.claimStatus || 'OPEN',
        claimNotes: payload.claimNotes || null,
        ...governedFields,
        projectName: payload.projectName || '',
        workOrderNumber: payload.workOrderNumber || null,
        severity: payload.severity || 'minor',
        solution: payload.solution || null,
        createdBy: operatorUserId || null,
        isDeleted: false,
      },
    });

    if (operatorUserId) {
      await SystemLogService.auditLog('vehicle-commissioning', 'issueCreate', {
        detailsVariables: {
          issue: row.description || row.id,
        },
        targetId: row.id,
        userId: operatorUserId,
      });
    }

    return mapVehicleCommissioningIssueToDto(row);
  },

  async getDailyReports(params: {
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    projectName?: string;
  }) {
    return VehicleCommissioningDailyReportService.getDailyReports(params);
  },

  async getDailyReportPreview(id: string) {
    return VehicleCommissioningDailyReportService.getDailyReportPreview(id);
  },

  async getIssues(params: VehicleCommissioningIssueParams) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const where: any = {
      isDeleted: false,
    };
    if (params.projectName) {
      where.projectName = { contains: String(params.projectName).trim() };
    }
    if (params.workOrderNumber) {
      where.workOrderNumber = {
        contains: String(params.workOrderNumber).trim(),
      };
    }
    if (params.status) {
      where.status = parseVehicleCommissioningIssueStatus(params.status);
    }
    if (params.date) {
      const day = new Date(params.date);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);
      where.date = { gte: day, lt: next };
    }

    const [items, total] = await Promise.all([
      prisma.vehicle_commissioning_issues.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.vehicle_commissioning_issues.count({ where }),
    ]);

    return {
      items: items.map((row) => mapVehicleCommissioningIssueToDto(row)),
      total,
    };
  },

  async getIssueLogs(id: string) {
    const items = await SystemLogService.getAuditLogsByTarget({
      targetId: id,
      targetType: 'vehicle_commissioning_issue',
    });

    return items.map((item) => ({
      action: item.action,
      createdAt: item.createdAt.toISOString(),
      details: item.details || '',
      id: item.id,
      operator: item.users?.realName || item.users?.username || item.userId,
    }));
  },

  async updateIssue(
    id: string,
    payload: Partial<VehicleCommissioningIssue>,
    operatorUserId?: string,
  ) {
    const status =
      payload.status === undefined
        ? undefined
        : parseVehicleCommissioningIssueStatus(payload.status);
    let closedAt: Date | null | undefined;
    if (status === ISSUE_TRACKING_STATUS.CLOSED) {
      closedAt = new Date();
    } else if (status !== undefined) {
      closedAt = null;
    }
    const governedFields = buildGovernedWriteFieldsForTable(
      'vehicle_commissioning_issues',
      {
        responsibleDepartment: payload.responsibleDepartment,
      },
    );
    const row = await prisma.vehicle_commissioning_issues.update({
      where: { id },
      data: {
        status,
        closedAt,
        description: payload.description,
        partName: payload.partName,
        projectName: payload.projectName,
        ...governedFields,
        severity: payload.severity,
        solution: payload.solution,
        issuePhoto:
          payload.photos === undefined
            ? undefined
            : normalizeVehicleCommissioningPhotos(payload.photos),
        isClaim:
          payload.isClaim === undefined ? undefined : Boolean(payload.isClaim),
        lossAmount:
          payload.lossAmount === undefined
            ? undefined
            : safeNumber(payload.lossAmount),
        recoveredAmount:
          payload.recoveredAmount === undefined
            ? undefined
            : safeNumber(payload.recoveredAmount),
        claimStatus: payload.claimStatus,
        claimNotes: payload.claimNotes,
        workOrderNumber: payload.workOrderNumber || undefined,
        date: payload.date ? new Date(payload.date) : undefined,
      },
    });

    if (operatorUserId) {
      await SystemLogService.auditLog('vehicle-commissioning', 'issueUpdate', {
        detailsVariables: {
          issue: row.description || row.id,
          status: String(row.status || ''),
        },
        targetId: row.id,
        userId: operatorUserId,
      });
    }

    return mapVehicleCommissioningIssueToDto(row);
  },
  async updateIssueFromBody(
    id: string,
    body: Record<string, unknown>,
    operatorUserId?: string,
  ) {
    const hasPhotos = body.photos !== undefined;
    let photos: string[] | undefined;
    if (!hasPhotos) {
      photos = undefined;
    } else if (Array.isArray(body.photos)) {
      photos = body.photos.map(String).filter(Boolean);
    } else {
      photos = [];
    }
    const toNumber = (value: unknown) => {
      if (value === undefined || value === null || value === '')
        return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const updated = await this.updateIssue(
      id,
      {
        assignee: body.assignee ? String(body.assignee) : undefined,
        date: body.date ? String(body.date) : undefined,
        description: body.description ? String(body.description) : undefined,
        isClaim:
          body.isClaim === undefined
            ? undefined
            : ['1', 'true', 'yes', '是'].includes(
                String(body.isClaim).toLowerCase(),
              ),
        lossAmount: toNumber(body.lossAmount),
        partName: body.partName ? String(body.partName) : undefined,
        photos,
        projectName: body.projectName ? String(body.projectName) : undefined,
        recoveredAmount: toNumber(body.recoveredAmount),
        ...buildGovernedWriteFieldsForTable('vehicle_commissioning_issues', {
          responsibleDepartment: body.responsibleDepartment
            ? String(body.responsibleDepartment)
            : undefined,
        }),
        claimNotes: body.claimNotes ? String(body.claimNotes) : undefined,
        claimStatus: body.claimStatus ? String(body.claimStatus) : undefined,
        severity: body.severity ? String(body.severity) : undefined,
        solution: body.solution ? String(body.solution) : undefined,
        status: body.status
          ? parseVehicleCommissioningIssueStatus(body.status)
          : undefined,
        workOrderNumber: body.workOrderNumber
          ? String(body.workOrderNumber)
          : undefined,
      },
      operatorUserId,
    );
    if (photos !== undefined) {
      try {
        await FileStorageService.registerReferencesFromAttachments({
          attachments: photos,
          bizId: String(updated.id),
          bizType: 'vehicle_commissioning_issue',
          fieldName: 'photos',
        });
      } catch (error) {
        if (!isPrismaSchemaMismatchError(error)) throw error;
      }
    }
    return updated;
  },
};
