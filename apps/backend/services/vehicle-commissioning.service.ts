import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueParams,
} from '@qgs/shared';

import { formatDate } from '@qgs/shared';
import { nanoid } from 'nanoid';
import { SystemLogService } from '~/services/system-log.service';
import prisma from '~/utils/prisma';

const ISSUE_CATEGORY = 'vehicle_commissioning';
const QUALITY_RECORD_STATUS = {
  CLOSED: 'CLOSED',
  IN_PROGRESS: 'IN_PROGRESS',
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;
type QualityRecordStatus =
  (typeof QUALITY_RECORD_STATUS)[keyof typeof QUALITY_RECORD_STATUS];
const ISSUE_SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

function parseIssueStatus(value: unknown): QualityRecordStatus {
  const raw = String(value || '').toUpperCase();
  if (raw === 'CLOSED') return QUALITY_RECORD_STATUS.CLOSED;
  if (raw === 'RESOLVED') return QUALITY_RECORD_STATUS.RESOLVED;
  if (raw === 'IN_PROGRESS') return QUALITY_RECORD_STATUS.IN_PROGRESS;
  return QUALITY_RECORD_STATUS.OPEN;
}

function mapIssueStatus(value: string): VehicleCommissioningIssue['status'] {
  if (value === 'CLOSED') return 'CLOSED';
  if (value === 'RESOLVED') return 'RESOLVED';
  if (value === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'OPEN';
}

function buildReportText(params: {
  closedIssues: VehicleCommissioningIssue[];
  openIssues: VehicleCommissioningIssue[];
  payload: VehicleCommissioningDailyReportPayload;
}) {
  const { payload, openIssues, closedIssues } = params;
  const lines: string[] = [
    `项目：${payload.projectName || '-'}`,
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

function formatIssueLine(item: VehicleCommissioningIssue) {
  const desc = String(item.description || item.title || '').trim();
  const part = String(item.partName || '').trim();
  const status = String(item.status || '').trim();
  let statusText = '待处理';
  switch (status) {
    case 'CLOSED': {
      statusText = '已关闭';
      break;
    }
    case 'IN_PROGRESS': {
      statusText = '处理中';
      break;
    }
    case 'RESOLVED': {
      statusText = '待验证';
      break;
    }
    default: {
      break;
    }
  }
  const sections = [
    `[${getSeverityLabel(item.severity)}]`,
    part ? `部件:${part}` : '',
    desc || '-',
    `状态:${statusText}`,
  ].filter(Boolean);
  return sections.join('，');
}

function mapRecordToIssue(
  row: Awaited<ReturnType<typeof prisma.quality_records.findMany>>[number],
): VehicleCommissioningIssue {
  return {
    assignee: row.inspector || '',
    createdAt: row.createdAt.toISOString(),
    date: formatDate(row.date),
    description: row.description || '',
    id: row.id,
    partName: row.partName || '',
    projectName: row.projectName || '',
    responsibleDepartment: row.responsibleDepartment || '',
    severity: row.severity || '',
    solution: row.solution || '',
    status: mapIssueStatus(row.status),
    title: row.description || '',
    updatedAt: row.updatedAt.toISOString(),
    workOrderNumber: row.workOrderNumber || '',
  };
}

function dedupeIssues(items: VehicleCommissioningIssue[]) {
  const seen = new Set<string>();
  const result: VehicleCommissioningIssue[] = [];
  for (const item of items) {
    const key = `${item.id}|${item.description}|${item.partName}|${item.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sortIssuesForReport(items: VehicleCommissioningIssue[]) {
  return [...items].sort((a, b) => {
    const bySeverity =
      getSeverityRank(b.severity) - getSeverityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.createdAt.localeCompare(b.createdAt);
  });
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
    } as VehicleCommissioningDailyReport;
  }

  const normalizedMainWorks = parsed.mainWorks.map((item) =>
    normalizeMainWorkItem(item),
  );
  const reportPayload: VehicleCommissioningDailyReportPayload = {
    ...parsed,
    mainWorks: normalizedMainWorks,
  };
  const issues = await resolveReportIssues(reportPayload);
  const mappedIssues = dedupeIssues(
    issues.map((issue) => mapRecordToIssue(issue)),
  );
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

async function resolveReportIssues(
  payload: Partial<VehicleCommissioningDailyReportPayload>,
) {
  const projectName = String(payload.projectName || '').trim();
  const ids = Array.isArray(payload.issueIds) ? payload.issueIds : [];
  const baseWhere: any = {
    isDeleted: false,
    category: ISSUE_CATEGORY,
  };
  const openIssueStatuses = [
    QUALITY_RECORD_STATUS.OPEN,
    QUALITY_RECORD_STATUS.IN_PROGRESS,
    QUALITY_RECORD_STATUS.RESOLVED,
  ];

  let issues = await prisma.quality_records.findMany({
    where:
      ids.length > 0
        ? {
            ...baseWhere,
            id: { in: ids },
          }
        : {
            ...baseWhere,
            status: { in: openIssueStatuses },
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

  return issues;
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

async function getNextIssueSerialNumber() {
  const result = await prisma.quality_records.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

async function resolveInspectorUsername(value?: string) {
  const username = String(value || '').trim();
  if (!username) return null;
  const user = await prisma.users.findUnique({
    where: { username },
    select: { username: true },
  });
  return user?.username || null;
}

export const VehicleCommissioningService = {
  async createDailyReport(payload: VehicleCommissioningDailyReportPayload) {
    const issues = await resolveReportIssues(payload);

    const normalizedMainWorks = payload.mainWorks.map((item) =>
      normalizeMainWorkItem(item),
    );
    const mappedIssues = dedupeIssues(
      issues.map((row) => mapRecordToIssue(row)),
    );
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
    } as VehicleCommissioningDailyReport;
  },

  async createIssue(
    payload: Partial<VehicleCommissioningIssue>,
    operatorUserId?: string,
  ) {
    const serialNumber = await getNextIssueSerialNumber();
    const now = new Date();
    const inspector = await resolveInspectorUsername(payload.assignee);
    const row = await prisma.quality_records.create({
      data: {
        id: `VCI-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`,
        serialNumber,
        category: ISSUE_CATEGORY,
        date: payload.date ? new Date(payload.date) : now,
        status: parseIssueStatus(payload.status),
        partName: payload.partName || '车辆总成',
        description: payload.description || payload.title || '',
        quantity: 1,
        responsibleDepartment: payload.responsibleDepartment || '调试组',
        projectName: payload.projectName || '',
        workOrderNumber: payload.workOrderNumber || null,
        severity: payload.severity || 'minor',
        solution: payload.solution || null,
        inspector,
        isDeleted: false,
        lossAmount: 0,
      },
    });

    if (operatorUserId) {
      await SystemLogService.recordAuditLog({
        action: 'CREATE',
        details: `创建车辆调试问题: ${row.description || row.id}`,
        targetId: row.id,
        targetType: 'vehicle_commissioning_issue',
        userId: operatorUserId,
      });
    }

    return {
      assignee: row.inspector || '',
      createdAt: row.createdAt.toISOString(),
      date: formatDate(row.date),
      description: row.description || '',
      id: row.id,
      partName: row.partName || '',
      projectName: row.projectName || '',
      responsibleDepartment: row.responsibleDepartment || '',
      severity: row.severity || '',
      solution: row.solution || '',
      status: mapIssueStatus(row.status),
      title: row.description || '',
      updatedAt: row.updatedAt.toISOString(),
      workOrderNumber: row.workOrderNumber || '',
    } as VehicleCommissioningIssue;
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
      category: ISSUE_CATEGORY,
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
      prisma.quality_records.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.quality_records.count({ where }),
    ]);

    return {
      items: items.map((row) => ({
        assignee: row.inspector || '',
        closedAt: row.status === 'CLOSED' ? formatDate(row.updatedAt) : '',
        createdAt: row.createdAt.toISOString(),
        date: formatDate(row.date),
        description: row.description || '',
        id: row.id,
        partName: row.partName || '',
        projectName: row.projectName || '',
        responsibleDepartment: row.responsibleDepartment || '',
        severity: row.severity || '',
        solution: row.solution || '',
        status: mapIssueStatus(row.status),
        title: row.description || '',
        updatedAt: row.updatedAt.toISOString(),
        workOrderNumber: row.workOrderNumber || '',
      })) as VehicleCommissioningIssue[],
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
    const inspector =
      payload.assignee === undefined
        ? undefined
        : await resolveInspectorUsername(payload.assignee);
    const row = await prisma.quality_records.update({
      where: { id },
      data: {
        status: payload.status ? parseIssueStatus(payload.status) : undefined,
        description: payload.description,
        partName: payload.partName,
        projectName: payload.projectName,
        responsibleDepartment: payload.responsibleDepartment,
        severity: payload.severity,
        solution: payload.solution,
        inspector,
        workOrderNumber: payload.workOrderNumber || undefined,
        date: payload.date ? new Date(payload.date) : undefined,
      },
    });

    if (operatorUserId) {
      await SystemLogService.recordAuditLog({
        action: 'UPDATE',
        details: `更新车辆调试问题: ${row.description || row.id}, 状态=${row.status}`,
        targetId: row.id,
        targetType: 'vehicle_commissioning_issue',
        userId: operatorUserId,
      });
    }

    return {
      assignee: row.inspector || '',
      closedAt: row.status === 'CLOSED' ? formatDate(row.updatedAt) : '',
      createdAt: row.createdAt.toISOString(),
      date: formatDate(row.date),
      description: row.description || '',
      id: row.id,
      partName: row.partName || '',
      projectName: row.projectName || '',
      responsibleDepartment: row.responsibleDepartment || '',
      severity: row.severity || '',
      solution: row.solution || '',
      status: mapIssueStatus(row.status),
      title: row.description || '',
      updatedAt: row.updatedAt.toISOString(),
      workOrderNumber: row.workOrderNumber || '',
    } as VehicleCommissioningIssue;
  },
};
