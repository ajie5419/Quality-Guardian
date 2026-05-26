import prisma from '~/utils/prisma';

export type DailyReportQueryParams = {
  dateFrom?: Date;
  dateTo?: Date;
  projectName?: string;
  skip?: number;
  take?: number;
};

export const VehicleCommissioningDailyReportStorageService = {
  async upsertDailySummary(input: {
    date: Date;
    reporter: string;
    reportText: string;
    summary: string;
  }) {
    return prisma.daily_reports.upsert({
      where: { date_reporter: { date: input.date, reporter: input.reporter } },
      update: {
        reportText: input.reportText,
        summary: input.summary,
      },
      create: {
        date: input.date,
        reporter: input.reporter,
        reportText: input.reportText,
        summary: input.summary,
      },
    });
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

  async findDailyReportByDateReporter(input: { date: Date; reporter: string }) {
    return prisma.daily_reports.findUnique({
      where: {
        date_reporter: { date: input.date, reporter: input.reporter },
      },
    });
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
