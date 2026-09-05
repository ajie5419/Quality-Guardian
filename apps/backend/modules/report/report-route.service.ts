import type { ReportItem, SaveDailySummaryResult } from '@qgs/shared';
import type { UserSession } from '~/utils/jwt-utils';

import type { ReportWriteAuditContext } from './report-write.service';

import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import prisma from '~/utils/prisma';

import { formatReportDate } from './report-utils';
import {
  buildReportOwnershipWhere,
  ReportWriteService,
} from './report-write.service';

export const ReportRouteService = {
  async deleteById(
    id: string,
    userinfo: UserSession,
    audit?: ReportWriteAuditContext,
  ) {
    return ReportWriteService.deleteReport({ audit, id, userinfo });
  },
  async getList(userinfo: UserSession): Promise<ReportItem[]> {
    const rows = await prisma.reports.findMany({
      orderBy: { date: 'desc' },
      where: buildReportOwnershipWhere(userinfo),
    });
    return rows.map((r) => ({ ...r, date: formatReportDate(r.date) }));
  },
  async saveDailySummary(input: {
    audit?: ReportWriteAuditContext;
    date: string;
    summary: string;
    userinfo: UserSession;
  }): Promise<SaveDailySummaryResult> {
    return ReportWriteService.saveDailySummary(input);
  },
  async createDailyReport(input: {
    date: Date;
    projectName?: null | string;
    reporter: string;
    reportText?: null | string;
    summary: string;
    workOrderNumber?: null | string;
  }) {
    return VehicleCommissioningDailyReportStorageService.createDailyReport(
      input,
    );
  },
  async findDailyReportById(id: string) {
    return VehicleCommissioningDailyReportStorageService.findDailyReportById(
      id,
    );
  },
  async countDailyReports(params: {
    dateFrom?: Date;
    dateTo?: Date;
    projectName?: string;
  }) {
    return VehicleCommissioningDailyReportStorageService.countDailyReports(
      params,
    );
  },
  async findDailyReports(params: {
    dateFrom?: Date;
    dateTo?: Date;
    projectName?: string;
    skip?: number;
    take?: number;
  }) {
    return VehicleCommissioningDailyReportStorageService.findDailyReports({
      ...params,
    });
  },
  async updateById(
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
    audit?: ReportWriteAuditContext,
  ) {
    return ReportWriteService.updateReport({ audit, body, id, userinfo });
  },
  async create(input: {
    audit?: ReportWriteAuditContext;
    body: Record<string, unknown>;
    userinfo: UserSession;
  }) {
    return ReportWriteService.createReport(input);
  },
};
