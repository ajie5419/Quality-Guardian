import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueParams,
} from '@qgs/shared';

import { formatDate, safeNumber, tryParsePhotos } from '@qgs/shared';
import { nanoid } from 'nanoid';
import { SystemLogService } from '~/services/system-log.service';
import prisma from '~/utils/prisma';

const ISSUE_STATUS = {
  CLOSED: 'CLOSED',
  IN_PROGRESS: 'IN_PROGRESS',
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;
const ISSUE_SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};
const DEFAULT_CLAIM_STATUS = 'OPEN';

type VehicleIssueRow = Awaited<
  ReturnType<typeof prisma.vehicle_commissioning_issues.findMany>
>[number];

function parseIssueStatus(value: unknown) {
  const raw = String(value || '').toUpperCase();
  if (raw === ISSUE_STATUS.CLOSED) return ISSUE_STATUS.CLOSED;
  if (raw === ISSUE_STATUS.RESOLVED) return ISSUE_STATUS.RESOLVED;
  if (raw === ISSUE_STATUS.IN_PROGRESS) return ISSUE_STATUS.IN_PROGRESS;
  return ISSUE_STATUS.OPEN;
}

function normalizePhotos(photos?: string[]) {
  return JSON.stringify((photos || []).filter(Boolean));
}

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

function getSeverityLabel(severity?: string) {
  const value = String(severity || '').toLowerCase();
  if (value === 'critical') return '严重';
  if (value === 'major') return '一般';
  return '轻微';
}

function getSeverityRank(severity?: string) {
  return ISSUE_SEVERITY_RANK[String(severity || '').toLowerCase()] || 0;
}

function mapIssueToDto(row: VehicleIssueRow): VehicleCommissioningIssue {
  return {
    claimNotes: row.claimNotes || '',
    claimStatus: row.claimStatus || DEFAULT_CLAIM_STATUS,
    closedAt: row.closedAt ? row.closedAt.toISOString() : '',
    createdAt: row.createdAt.toISOString(),
    date: formatDate(row.date),
    description: row.description || '',
    id: row.id,
    isClaim: Boolean(row.isClaim),
    lossAmount: safeNumber(row.lossAmount),
    partName: row.partName || '',
    photos: tryParsePhotos(row.issuePhoto),
    projectName: row.projectName || '',
    recoveredAmount: safeNumber(row.recoveredAmount),
    responsibleDepartment: row.responsibleDepartment || '',
    severity: row.severity || '',
    solution: row.solution || '',
    status: parseIssueStatus(row.status),
    title: row.description || '',
    updatedAt: row.updatedAt.toISOString(),
    workOrderNumber: row.workOrderNumber || '',
  };
}

function formatIssueLine(item: VehicleCommissioningIssue) {
  const desc = String(item.description || item.title || '').trim();
  const part = String(item.partName || '').trim();
  let statusText = '待处理';
  if (item.status === 'CLOSED') statusText = '已关闭';
  if (item.status === 'IN_PROGRESS') statusText = '处理中';
  if (item.status === 'RESOLVED') statusText = '待验证';
  const sections = [
    `[${getSeverityLabel(item.severity)}]`,
    part ? `部件:${part}` : '',
    desc || '-',
    `状态:${statusText}`,
  ].filter(Boolean);
  return sections.join('，');
}

function sortIssuesForReport(items: VehicleCommissioningIssue[]) {
  return [...items].sort((a, b) => {
    const bySeverity =
      getSeverityRank(b.severity) - getSeverityRank(a.severity);
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

async function resolveReportIssues(
  payload: Partial<VehicleCommissioningDailyReportPayload>,
) {
  const projectName = String(payload.projectName || '').trim();
  const ids = Array.isArray(payload.issueIds) ? payload.issueIds : [];
  const baseWhere: any = {
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
                ISSUE_STATUS.OPEN,
                ISSUE_STATUS.IN_PROGRESS,
                ISSUE_STATUS.RESOLVED,
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
  reporter: string;
  summary: null | string;
  updatedAt: Date;
}) {
  const parsed = parseReportSummary(row.summary);
  if (!parsed) {
    return {
      id: row.id,
      date: formatDate(row.date),
      projectName: '',
      reporters: row.reporter ? row.reporter.split(/\s+/).filter(Boolean) : [],
      mainWorks: [],
      notes: '',
      issueIds: [],
      reportText: row.summary || '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      workOrderNumber: '',
    } as VehicleCommissioningDailyReport;
  }

  const normalizedMainWorks = parsed.mainWorks.map((item) =>
    normalizeMainWorkItem(item),
  );
  const reportPayload: VehicleCommissioningDailyReportPayload = {
    ...parsed,
    mainWorks: normalizedMainWorks,
  };
  const reportIssues = await resolveReportIssues(reportPayload);
  const mappedIssues = reportIssues.map((issue) => mapIssueToDto(issue));
  const openIssues = sortIssuesForReport(
    mappedIssues.filter((item) => item.status !== 'CLOSED'),
  );
  const closedIssues = sortIssuesForReport(
    mappedIssues.filter((item) => item.status === 'CLOSED'),
  );

  return {
    ...parsed,
    id: row.id,
    date: formatDate(row.date),
    mainWorks: normalizedMainWorks,
    issueIds: mappedIssues.map((item) => item.id),
    reportText: buildReportText({
      payload: reportPayload,
      openIssues,
      closedIssues,
    }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as VehicleCommissioningDailyReport;
}

export const VehicleCommissioningService = {
  async createDailyReport(payload: VehicleCommissioningDailyReportPayload) {
    const normalizedMainWorks = payload.mainWorks.map((item) =>
      normalizeMainWorkItem(item),
    );
    const reportIssues = await resolveReportIssues(payload);
    const mappedIssues = reportIssues.map((row) => mapIssueToDto(row));
    const closedIssues = sortIssuesForReport(
      mappedIssues.filter((item) => item.status === 'CLOSED'),
    );
    const openIssues = sortIssuesForReport(
      mappedIssues.filter((item) => item.status !== 'CLOSED'),
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

    const row = await prisma.daily_reports.create({
      data: {
        date: new Date(payload.date),
        reporter: payload.reporters.join(' '),
        summary,
      },
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

  async createIssue(
    payload: Partial<VehicleCommissioningIssue>,
    operatorUserId?: string,
  ) {
    const now = new Date();
    const status = parseIssueStatus(payload.status);
    const row = await prisma.vehicle_commissioning_issues.create({
      data: {
        id: `DA-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`,
        date: payload.date ? new Date(payload.date) : now,
        status,
        closedAt: status === ISSUE_STATUS.CLOSED ? now : null,
        partName: payload.partName || '车辆总成',
        description: payload.description || payload.title || '',
        issuePhoto: normalizePhotos(payload.photos),
        isClaim: Boolean(payload.isClaim),
        lossAmount: safeNumber(payload.lossAmount),
        recoveredAmount: safeNumber(payload.recoveredAmount),
        claimStatus: payload.claimStatus || DEFAULT_CLAIM_STATUS,
        claimNotes: payload.claimNotes || null,
        responsibleDepartment: payload.responsibleDepartment || '调试组',
        projectName: payload.projectName || '',
        workOrderNumber: payload.workOrderNumber || null,
        severity: payload.severity || 'minor',
        solution: payload.solution || null,
        createdBy: operatorUserId || null,
        isDeleted: false,
      },
    });

    if (operatorUserId) {
      await SystemLogService.recordAuditLog({
        action: 'CREATE',
        details: `创建调试验收问题: ${row.description || row.id}`,
        targetId: row.id,
        targetType: 'vehicle_commissioning_issue',
        userId: operatorUserId,
      });
    }

    return mapIssueToDto(row);
  },

  async getDailyReports(params: {
    page?: number;
    pageSize?: number;
    projectName?: string;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const where = params.projectName
      ? {
          summary: {
            contains: String(params.projectName).trim(),
          },
        }
      : {};

    const allItems = await prisma.daily_reports.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    const vehicleReportRows = allItems.filter((row) =>
      parseReportSummary(row.summary),
    );
    const pageRows = vehicleReportRows.slice(skip, skip + pageSize);
    const mapped = await Promise.all(
      pageRows.map((row) => buildRealtimeReportData(row)),
    );

    return { items: mapped, total: vehicleReportRows.length };
  },

  async getDailyReportPreview(id: string) {
    const row = await prisma.daily_reports.findUnique({ where: { id } });
    if (!row) return null;
    return buildRealtimeReportData(row);
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
      where.status = parseIssueStatus(params.status);
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
      items: items.map((row) => mapIssueToDto(row)),
      total,
    };
  },

  async getIssueLogs(id: string) {
    const items = await prisma.audit_logs.findMany({
      where: {
        targetId: id,
        targetType: 'vehicle_commissioning_issue',
      },
      include: {
        users: {
          select: {
            realName: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
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
        : parseIssueStatus(payload.status);
    let closedAt: Date | null | undefined;
    if (status === ISSUE_STATUS.CLOSED) {
      closedAt = new Date();
    } else if (status !== undefined) {
      closedAt = null;
    }
    const row = await prisma.vehicle_commissioning_issues.update({
      where: { id },
      data: {
        status,
        closedAt,
        description: payload.description,
        partName: payload.partName,
        projectName: payload.projectName,
        responsibleDepartment: payload.responsibleDepartment,
        severity: payload.severity,
        solution: payload.solution,
        issuePhoto:
          payload.photos === undefined
            ? undefined
            : normalizePhotos(payload.photos),
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
      await SystemLogService.recordAuditLog({
        action: 'UPDATE',
        details: `更新调试验收问题: ${row.description || row.id}, 状态=${row.status}`,
        targetId: row.id,
        targetType: 'vehicle_commissioning_issue',
        userId: operatorUserId,
      });
    }

    return mapIssueToDto(row);
  },
};
