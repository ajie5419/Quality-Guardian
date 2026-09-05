import type { UserSession } from '~/utils/jwt-utils';

import { ErrorCode, isSystemAdmin } from '@qgs/shared';
import { SystemLogService } from '~/modules/system-log';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  formatReportDate,
  parseReportDate,
  parseReportNumber,
} from './report-utils';

/**
 * Explicit report state machine (SEC-REPORT-WRITE-001). A report is a
 * committed quality record once Published: it can then only be archived, and
 * a Published report cannot be deleted directly. New records always start as
 * Draft.
 */
export const REPORT_WRITE_STATUSES = [
  'Draft',
  'Published',
  'Archived',
] as const;
export type ReportWriteStatus = (typeof REPORT_WRITE_STATUSES)[number];

const REPORT_STATUS_TRANSITIONS: Record<
  ReportWriteStatus,
  ReportWriteStatus[]
> = {
  Archived: ['Draft'],
  Draft: ['Published', 'Archived'],
  Published: ['Archived'],
};

export function normalizeReportWriteStatus(
  value: unknown,
): null | ReportWriteStatus {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'published') return 'Published';
  if (normalized === 'archived') return 'Archived';
  return null;
}

/**
 * Object-authorization where for user-triggered report writes: the report
 * must have been authored by the current user unless the caller is a system
 * admin (ALL). The reports table carries no department dimension, so author
 * ownership is the object-level boundary; admin spreads an empty object to
 * keep the write scoped in static analysis.
 */
export function buildReportOwnershipWhere(
  userinfo: UserSession,
): Record<string, unknown> {
  if (isSystemAdmin(userinfo)) return {};
  const identities = [userinfo.realName, userinfo.username].filter(
    (value): value is string =>
      typeof value === 'string' && value.trim() !== '',
  );
  if (identities.length === 0) {
    return { OR: [{ id: '__none__' }] };
  }
  return { OR: identities.map((author) => ({ author })) };
}

function isReportOwner(userinfo: UserSession, author: null | string): boolean {
  if (!author) return false;
  const identities = [userinfo.realName, userinfo.username].filter(
    (value): value is string =>
      typeof value === 'string' && value.trim() !== '',
  );
  return identities.some(
    (identity) => identity.toLowerCase() === author.toLowerCase(),
  );
}

function assertReportTransition(
  currentStatus: string,
  nextStatus: ReportWriteStatus,
) {
  const currentCanonical = normalizeReportWriteStatus(currentStatus);
  if (!currentCanonical) {
    throw new BusinessError(
      ErrorCode.CONFLICT,
      '当前报告状态无法识别，不能执行状态变更',
      409,
    );
  }
  if (currentCanonical === nextStatus) return;
  const allowed = REPORT_STATUS_TRANSITIONS[currentCanonical] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessError(
      ErrorCode.CONFLICT,
      `不允许从 ${currentCanonical} 切换到 ${nextStatus}`,
      409,
    );
  }
}

export interface ReportWriteAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

async function auditReportWrite(input: {
  action: 'create' | 'daily-summary' | 'delete' | 'update';
  audit?: ReportWriteAuditContext;
  detailsVariables: Record<string, unknown>;
  targetId: string;
  userinfo: UserSession;
}) {
  await SystemLogService.auditLog('report', input.action, {
    detailsVariables: input.detailsVariables,
    ipAddress: input.audit?.ipAddress,
    targetId: input.targetId,
    userAgent: input.audit?.userAgent,
    userId: String(input.userinfo.id ?? input.userinfo.userId ?? ''),
  });
}

export const ReportWriteService = {
  async updateReport(input: {
    audit?: ReportWriteAuditContext;
    body: Record<string, unknown>;
    id: string;
    userinfo: UserSession;
  }) {
    const { body, id, userinfo } = input;
    const current = await prisma.reports.findUnique({
      where: { id },
      select: { author: true, status: true },
    });
    if (!current) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '报告不存在', 404);
    }
    if (!isSystemAdmin(userinfo) && !isReportOwner(userinfo, current.author)) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '无权操作该报告', 403);
    }

    const dataUpdate: Record<string, unknown> = {};
    let nextStatus: null | ReportWriteStatus = null;
    if (body.status !== undefined) {
      nextStatus = normalizeReportWriteStatus(body.status);
      if (!nextStatus) {
        throw new BusinessError(ErrorCode.VALIDATION, '无效的报告状态', 400);
      }
      assertReportTransition(current.status, nextStatus);
      dataUpdate.status = nextStatus;
    }
    if (body.totalInspections !== undefined)
      dataUpdate.totalInspections = parseReportNumber(body.totalInspections, 0);
    if (body.passRate !== undefined)
      dataUpdate.passRate = parseReportNumber(body.passRate, 0);
    if (body.majorDefects !== undefined)
      dataUpdate.majorDefects = parseReportNumber(body.majorDefects, 0);
    if (body.minorDefects !== undefined)
      dataUpdate.minorDefects = parseReportNumber(body.minorDefects, 0);
    if (body.date !== undefined) {
      const parsedDate = parseReportDate(body.date);
      if (!parsedDate)
        throw new BusinessError(ErrorCode.VALIDATION, '无效的日期', 400);
      dataUpdate.date = parsedDate;
    }
    if (body.author !== undefined) {
      // The author is the record owner; it cannot be re-assigned through the
      // update body (ownership boundary would become meaningless).
      throw new BusinessError(ErrorCode.FORBIDDEN, '不允许修改报告作者', 403);
    }

    const result = await prisma.reports.updateMany({
      where: {
        id,
        status: current.status,
        ...buildReportOwnershipWhere(userinfo),
      },
      data: dataUpdate,
    });
    if (result.count !== 1) {
      throw new BusinessError(
        ErrorCode.CONFLICT,
        '报告已被其他操作修改，请刷新后重试',
        409,
      );
    }
    const updated = await prisma.reports.findUnique({ where: { id } });
    if (!updated) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '报告不存在', 404);
    }
    await auditReportWrite({
      action: 'update',
      detailsVariables: {
        date: formatReportDate(updated.date),
        id,
        status: nextStatus ?? current.status,
      },
      targetId: id,
      userinfo,
      audit: input.audit,
    });
    return { ...updated, date: formatReportDate(updated.date) };
  },

  async deleteReport(input: {
    audit?: ReportWriteAuditContext;
    id: string;
    userinfo: UserSession;
  }) {
    const { id, userinfo } = input;
    const current = await prisma.reports.findUnique({
      where: { id },
      select: { author: true, status: true },
    });
    if (!current) {
      throw new BusinessError(ErrorCode.NOT_FOUND, '报告不存在', 404);
    }
    if (!isSystemAdmin(userinfo) && !isReportOwner(userinfo, current.author)) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '无权操作该报告', 403);
    }
    if (current.status.toLowerCase() === 'published') {
      throw new BusinessError(
        ErrorCode.CONFLICT,
        '已发布的报告不能直接删除，请先归档',
        409,
      );
    }
    const result = await prisma.reports.deleteMany({
      where: {
        id,
        status: current.status,
        ...buildReportOwnershipWhere(userinfo),
      },
    });
    if (result.count !== 1) {
      throw new BusinessError(
        ErrorCode.CONFLICT,
        '报告已被其他操作修改，请刷新后重试',
        409,
      );
    }
    await auditReportWrite({
      action: 'delete',
      detailsVariables: { id, status: current.status },
      targetId: id,
      userinfo,
      audit: input.audit,
    });
    return { message: 'Deleted' };
  },

  async createReport(input: {
    audit?: ReportWriteAuditContext;
    body: Record<string, unknown>;
    userinfo: UserSession;
  }) {
    const { body, userinfo } = input;
    const reportDate = parseReportDate(body.date);
    if (!reportDate)
      throw new BusinessError(ErrorCode.VALIDATION, '无效的日期', 400);
    if (body.status !== undefined) {
      const status = normalizeReportWriteStatus(body.status);
      if (!status) {
        throw new BusinessError(ErrorCode.VALIDATION, '无效的报告状态', 400);
      }
      if (status !== 'Draft') {
        throw new BusinessError(
          ErrorCode.CONFLICT,
          '新报告只能以 Draft 状态创建',
          409,
        );
      }
    }
    const created = await prisma.reports.create({
      data: {
        author: userinfo.realName || userinfo.username || '',
        date: reportDate,
        majorDefects: parseReportNumber(body.majorDefects, 0),
        minorDefects: parseReportNumber(body.minorDefects, 0),
        passRate: parseReportNumber(body.passRate, 0),
        status: 'Draft',
        totalInspections: parseReportNumber(body.totalInspections, 0),
      },
    });
    await auditReportWrite({
      action: 'create',
      detailsVariables: {
        date: formatReportDate(created.date),
        id: created.id,
      },
      targetId: created.id,
      userinfo,
      audit: input.audit,
    });
    return { ...created, date: formatReportDate(created.date) };
  },

  async saveDailySummary(input: {
    audit?: ReportWriteAuditContext;
    date: string;
    summary: string;
    userinfo: UserSession;
  }) {
    const reportDate = parseReportDate(input.date);
    if (!reportDate)
      throw new BusinessError(ErrorCode.VALIDATION, '无效的日期', 400);
    // The reporter always derives from the authenticated user; the legacy
    // `user` body field can no longer impersonate another reporter.
    const reporter = String(
      input.userinfo.realName || input.userinfo.username || '',
    ).trim();
    if (!reporter) {
      throw new BusinessError(ErrorCode.FORBIDDEN, '缺少报告人身份', 403);
    }
    const reportText = String(input.summary || '');
    const saved =
      await VehicleCommissioningDailyReportStorageService.upsertDailySummary({
        date: reportDate,
        reporter,
        reportText,
        summary: JSON.stringify({ summary: input.summary }),
      });
    await auditReportWrite({
      action: 'daily-summary',
      detailsVariables: {
        date: formatReportDate(saved.date),
        reporter,
      },
      targetId: formatReportDate(saved.date),
      userinfo: input.userinfo,
      audit: input.audit,
    });
    return {
      date: formatReportDate(saved.date),
      documentItems: [],
      reporter,
      summary: input.summary,
    };
  },
};
