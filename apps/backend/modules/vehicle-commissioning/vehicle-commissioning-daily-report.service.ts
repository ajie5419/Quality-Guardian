import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
} from '@qgs/shared';

import { formatDate, ISSUE_TRACKING_STATUS } from '@qgs/shared';
import { ReportRouteService } from '~/modules/report';
import prisma from '~/utils/prisma';

import {
  getVehicleCommissioningSeverityLabel,
  getVehicleCommissioningSeverityRank,
  mapVehicleCommissioningIssueToDto,
} from './vehicle-commissioning-issue-format';

function normalizeProjectName(value?: string) {
  return String(value || '')
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .trim();
}

function normalizeMainWorkItem(item: string) {
  const normalized = String(item)
    .replace(/^\s*\d+\s*[、，,.．]\s*/u, '')
    .replace(/^\s*[-*]\s*/u, '')
    .trim();
  return normalized || String(item || '').trim();
}

function formatIssueLine(item: VehicleCommissioningIssue) {
  const desc = String(item.description || item.title || '').trim();
  const part = String(item.partName || '').trim();
  let statusText = '待处理';
  if (item.status === ISSUE_TRACKING_STATUS.CLOSED) statusText = '已关闭';
  if (item.status === ISSUE_TRACKING_STATUS.IN_PROGRESS) statusText = '处理中';
  if (item.status === ISSUE_TRACKING_STATUS.RESOLVED) statusText = '待验证';
  const sections = [
    `[${getVehicleCommissioningSeverityLabel(item.severity)}]`,
    part ? `部件:${part}` : '',
    desc || '-',
    `状态:${statusText}`,
  ].filter(Boolean);
  return sections.join('，');
}

function sortIssuesForReport(items: VehicleCommissioningIssue[]) {
  return [...items].sort((a, b) => {
    const bySeverity =
      getVehicleCommissioningSeverityRank(b.severity) -
      getVehicleCommissioningSeverityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function buildReportText(params: {
  closedIssues: VehicleCommissioningIssue[];
  openIssues: VehicleCommissioningIssue[];
  payload: VehicleCommissioningDailyReportPayload;
}) {
  const { payload, openIssues, closedIssues } = params;
  const lines: string[] = [
    `项目：${payload.projectName || '-'}`,
    `工单：${payload.workOrderNumber || '-'}`,
    `汇报人：${payload.reporters.join(' ') || '-'}`,
    `日期：${payload.date}`,
    '主要工作：',
  ];
  payload.mainWorks.forEach((item, index) => {
    lines.push(`${index + 1}、${normalizeMainWorkItem(item)}`);
  });
  lines.push('存在问题：');
  if (openIssues.length === 0) {
    lines.push('无');
  } else {
    openIssues.forEach((item, index) => {
      lines.push(`${index + 1}、${formatIssueLine(item)}`);
    });
  }
  if (closedIssues.length > 0) {
    lines.push('已关闭问题：');
    closedIssues.forEach((item, index) => {
      lines.push(`${index + 1}、${formatIssueLine(item)}`);
    });
  }
  if (payload.notes) {
    lines.push('备注：', payload.notes);
  }
  return lines.join('\n');
}

function parseReportSummary(summary?: null | string) {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as VehicleCommissioningDailyReport;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.projectName === 'string' &&
      Array.isArray(parsed.reporters) &&
      Array.isArray(parsed.mainWorks)
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function parseReportDateBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function resolveReportIssues(
  payload: Partial<VehicleCommissioningDailyReportPayload>,
) {
  const projectName = String(payload.projectName || '').trim();
  const ids = Array.isArray(payload.issueIds) ? payload.issueIds : [];
  const baseWhere = {
    isDeleted: false,
  };

  let issues = await prisma.vehicle_commissioning_issues.findMany({
    where:
      ids.length > 0
        ? {
            ...baseWhere,
            id: { in: ids },
          }
        : {
            ...baseWhere,
            status: {
              in: [
                ISSUE_TRACKING_STATUS.OPEN,
                ISSUE_TRACKING_STATUS.IN_PROGRESS,
                ISSUE_TRACKING_STATUS.RESOLVED,
              ],
            },
          },
    orderBy: { createdAt: 'asc' },
  });

  if (ids.length === 0 && projectName) {
    const normalizedTarget = normalizeProjectName(projectName);
    issues = issues.filter((row) => {
      const normalizedRow = normalizeProjectName(row.projectName || '');
      return (
        normalizedRow.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedRow)
      );
    });
  }
  if (ids.length === 0 && payload.workOrderNumber) {
    const workOrderNumber = String(payload.workOrderNumber).trim();
    issues = issues.filter((row) =>
      String(row.workOrderNumber || '').includes(workOrderNumber),
    );
  }

  return issues;
}

async function buildRealtimeReportData(row: {
  createdAt: Date;
  date: Date;
  id: string;
  projectName?: null | string;
  reporter: string;
  reportText?: null | string;
  summary: null | string;
  updatedAt: Date;
  workOrderNumber?: null | string;
}) {
  const parsed = parseReportSummary(row.summary);
  if (!parsed) {
    return {
      id: row.id,
      date: formatDate(row.date),
      projectName: row.projectName || '',
      reporters: row.reporter ? row.reporter.split(/\s+/).filter(Boolean) : [],
      mainWorks: [],
      notes: '',
      issueIds: [],
      reportText: row.reportText || row.summary || '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      workOrderNumber: row.workOrderNumber || '',
    } as VehicleCommissioningDailyReport;
  }

  const projectName = row.projectName || parsed.projectName;
  const workOrderNumber = row.workOrderNumber || parsed.workOrderNumber || '';
  const normalizedMainWorks = parsed.mainWorks.map((item) =>
    normalizeMainWorkItem(item),
  );
  const reportPayload: VehicleCommissioningDailyReportPayload = {
    ...parsed,
    projectName,
    mainWorks: normalizedMainWorks,
    workOrderNumber,
  };
  const reportIssues = await resolveReportIssues(reportPayload);
  const mappedIssues = reportIssues.map((issue) =>
    mapVehicleCommissioningIssueToDto(issue),
  );
  const openIssues = sortIssuesForReport(
    mappedIssues.filter((item) => item.status !== ISSUE_TRACKING_STATUS.CLOSED),
  );
  const closedIssues = sortIssuesForReport(
    mappedIssues.filter((item) => item.status === ISSUE_TRACKING_STATUS.CLOSED),
  );

  return {
    ...parsed,
    id: row.id,
    date: formatDate(row.date),
    projectName,
    mainWorks: normalizedMainWorks,
    issueIds: mappedIssues.map((item) => item.id),
    reportText:
      row.reportText ||
      buildReportText({
        payload: reportPayload,
        openIssues,
        closedIssues,
      }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    workOrderNumber,
  } as VehicleCommissioningDailyReport;
}

export const VehicleCommissioningDailyReportService = {
  async createDailyReport(payload: VehicleCommissioningDailyReportPayload) {
    const normalizedMainWorks = payload.mainWorks.map((item) =>
      normalizeMainWorkItem(item),
    );
    const reportIssues = await resolveReportIssues(payload);
    const mappedIssues = reportIssues.map((row) =>
      mapVehicleCommissioningIssueToDto(row),
    );
    const closedIssues = sortIssuesForReport(
      mappedIssues.filter(
        (item) => item.status === ISSUE_TRACKING_STATUS.CLOSED,
      ),
    );
    const openIssues = sortIssuesForReport(
      mappedIssues.filter(
        (item) => item.status !== ISSUE_TRACKING_STATUS.CLOSED,
      ),
    );
    const issueIds = mappedIssues.map((item) => item.id);

    const reportText = buildReportText({
      payload: {
        ...payload,
        mainWorks: normalizedMainWorks,
        issueIds,
      },
      openIssues,
      closedIssues,
    });
    const summary = JSON.stringify({
      ...payload,
      mainWorks: normalizedMainWorks,
      issueIds,
      reportText,
    });

    const row = await ReportRouteService.createDailyReport({
      date: new Date(payload.date),
      projectName: payload.projectName,
      reporter: payload.reporters.join(' '),
      reportText,
      summary,
      workOrderNumber: payload.workOrderNumber || null,
    });

    return {
      createdAt: row.createdAt.toISOString(),
      date: formatDate(row.date),
      id: row.id,
      issueIds,
      mainWorks: normalizedMainWorks,
      notes: payload.notes,
      projectName: payload.projectName,
      reportText,
      reporters: payload.reporters,
      updatedAt: row.updatedAt.toISOString(),
      workOrderNumber: payload.workOrderNumber || '',
    } as VehicleCommissioningDailyReport;
  },

  async getDailyReports(params: {
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    projectName?: string;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || 20)));
    const skip = (page - 1) * pageSize;
    const dateFrom = parseReportDateBoundary(params.dateFrom, false);
    const dateTo = parseReportDateBoundary(params.dateTo, true);
    const query = {
      dateFrom,
      dateTo,
      projectName: params.projectName,
    };
    const [pageRows, total] = await Promise.all([
      ReportRouteService.findDailyReports({
        ...query,
        skip,
        take: pageSize,
      }),
      ReportRouteService.countDailyReports(query),
    ]);
    const mapped = await Promise.all(
      pageRows.map((row) => buildRealtimeReportData(row)),
    );

    return {
      items: mapped.filter(
        (item) => item.projectName || item.mainWorks.length > 0,
      ),
      total,
    };
  },

  async getDailyReportPreview(id: string) {
    const row = await ReportRouteService.findDailyReportById(id);
    if (!row) return null;
    return buildRealtimeReportData(row);
  },
};
