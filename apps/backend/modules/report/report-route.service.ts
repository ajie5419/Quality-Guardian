import prisma from '~/utils/prisma';

import {
  formatReportDate,
  normalizeReportAuthor,
  normalizeReportStatus,
  parseReportDate,
  parseReportNumber,
} from './report-utils';

type DailyReportQueryParams = {
  dateFrom?: Date;
  dateTo?: Date;
  projectName?: string;
  skip?: number;
  take?: number;
};

export const ReportRouteService = {
  async deleteById(id: string) {
    await prisma.reports.delete({ where: { id } });
    return { message: 'Deleted' };
  },
  async getList() {
    const rows = await prisma.reports.findMany({ orderBy: { date: 'desc' } });
    return rows.map((r) => ({ ...r, date: formatReportDate(r.date) }));
  },
  async saveDailySummary(input: {
    date: string;
    reporter: string;
    summary: string;
  }) {
    const reportDate = parseReportDate(input.date);
    if (!reportDate) throw new Error('INVALID_DATE');
    const reportText = String(input.summary || '');
    const saved = await prisma.daily_reports.upsert({
      where: { date_reporter: { date: reportDate, reporter: input.reporter } },
      update: {
        reportText,
        summary: JSON.stringify({ summary: input.summary }),
      },
      create: {
        date: reportDate,
        reporter: input.reporter,
        reportText,
        summary: JSON.stringify({ summary: input.summary }),
      },
    });
    return {
      date: formatReportDate(saved.date),
      documentItems: [],
      reporter: input.reporter,
      summary: input.summary,
    };
  },
  async createDailyReport(input: {
    date: Date;
    projectName?: null | string;
    reporter: string;
    reportText?: null | string;
    summary: string;
    workOrderNumber?: null | string;
  }) {
    return prisma.daily_reports.create({
      data: input,
    });
  },
  async findDailyReportById(id: string) {
    return prisma.daily_reports.findUnique({ where: { id } });
  },
  async countDailyReports(params: DailyReportQueryParams) {
    return prisma.daily_reports.count({
      where: buildDailyReportWhere(params),
    });
  },
  async findDailyReports(params: DailyReportQueryParams) {
    return prisma.daily_reports.findMany({
      where: buildDailyReportWhere(params),
      orderBy: { date: 'desc' },
      ...(params.skip === undefined ? {} : { skip: params.skip }),
      ...(params.take === undefined ? {} : { take: params.take }),
    });
  },
  async updateById(id: string, body: Record<string, unknown>) {
    const dataUpdate: Record<string, unknown> = {};
    if (body.status !== undefined)
      dataUpdate.status = normalizeReportStatus(body.status);
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
      if (!parsedDate) throw new Error('INVALID_DATE');
      dataUpdate.date = parsedDate;
    }
    if (body.author !== undefined)
      dataUpdate.author = normalizeReportAuthor(body.author);
    const updated = await prisma.reports.update({
      where: { id },
      data: dataUpdate,
    });
    return { ...updated, date: formatReportDate(updated.date) };
  },
  async create(input: {
    body: Record<string, unknown>;
    fallbackAuthor: string;
  }) {
    const reportDate = parseReportDate(input.body.date);
    if (!reportDate) throw new Error('INVALID_DATE');
    const created = await prisma.reports.create({
      data: {
        author:
          normalizeReportAuthor(input.body.author) || input.fallbackAuthor,
        date: reportDate,
        majorDefects: parseReportNumber(input.body.majorDefects, 0),
        minorDefects: parseReportNumber(input.body.minorDefects, 0),
        passRate: parseReportNumber(input.body.passRate, 0),
        status: normalizeReportStatus(input.body.status),
        totalInspections: parseReportNumber(input.body.totalInspections, 0),
      },
    });
    return { ...created, date: formatReportDate(created.date) };
  },
};

function buildDailyReportWhere(params: DailyReportQueryParams) {
  const projectName = String(params.projectName || '').trim();
  return {
    ...(projectName
      ? {
          OR: [
            { projectName: { contains: projectName } },
            { summary: { contains: projectName } },
          ],
        }
      : {}),
    ...(params.dateFrom || params.dateTo
      ? {
          date: {
            ...(params.dateFrom ? { gte: params.dateFrom } : {}),
            ...(params.dateTo ? { lte: params.dateTo } : {}),
          },
        }
      : {}),
  };
}
