import type {
  VehicleCommissioningDailyReport,
  VehicleCommissioningDailyReportPayload,
  VehicleCommissioningIssue,
  VehicleCommissioningIssueParams,
} from '@qgs/shared';

import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

import {
  formatDate,
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
  safeNumber,
  tryParsePhotos,
} from '@qgs/shared';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { ReportRouteService } from '~/modules/report';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { buildGovernedWriteFieldsForTable } from '~/utils/master-data-governance-write';
import { UPLOAD_DIR } from '~/utils/paths';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

const ISSUE_SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};
const DEFAULT_CLAIM_STATUS = 'OPEN';
const IMAGE_COLUMN_KEY = 'photos';
const IMAGE_SIZE = {
  width: 64,
  height: 64,
};

type VehicleIssueRow = Awaited<
  ReturnType<typeof prisma.vehicle_commissioning_issues.findMany>
>[number];

function parseIssueStatus(value: unknown): VehicleCommissioningIssue['status'] {
  return normalizeIssueTrackingStatus(value, {
    allowed: [
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  }) as VehicleCommissioningIssue['status'];
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

function getStatusLabel(status: string) {
  if (status === 'CLOSED') return '已关闭';
  if (status === 'IN_PROGRESS') return '处理中';
  if (status === 'RESOLVED') return '待验证';
  return '待处理';
}

function getImageExtension(input: string): 'gif' | 'jpeg' | 'png' | undefined {
  const ext = extname(input.split('?')[0] || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'jpeg';
  if (ext === '.png') return 'png';
  if (ext === '.gif') return 'gif';
  return undefined;
}

function normalizeUploadObjectKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = raw.startsWith('http')
      ? new URL(raw)
      : new URL(raw, 'http://local');
    return decodeURIComponent(parsed.pathname)
      .replace(/^\/api\/uploads\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^\/+/, '');
  } catch {
    return raw
      .replace(/^\/api\/uploads\//, '')
      .replace(/^\/uploads\//, '')
      .replace(/^\/+/, '');
  }
}

async function loadImageForExcel(url: string) {
  const objectKey = normalizeUploadObjectKey(url);
  if (!objectKey) return null;

  let buffer: Uint8Array | undefined;
  const localPath = resolve(UPLOAD_DIR, objectKey);
  const relativePath = relative(UPLOAD_DIR, localPath);
  if (
    !relativePath.startsWith('..') &&
    !relativePath.includes('\0') &&
    existsSync(localPath)
  ) {
    buffer = readFileSync(localPath);
  } else {
    const storedName = objectKey.split('/').pop() || objectKey;
    const managed =
      await FileStorageService.getFileBufferByStoredName(storedName);
    buffer = managed?.buffer;
  }

  if (!buffer) return null;
  const extension = getImageExtension(objectKey);
  if (extension) {
    return {
      base64: Buffer.from(buffer).toString('base64'),
      extension,
    };
  }
  const pngBuffer = await sharp(buffer).png().toBuffer();
  return {
    base64: Buffer.from(pngBuffer).toString('base64'),
    extension: 'png' as const,
  };
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
  if (item.status === ISSUE_TRACKING_STATUS.CLOSED) statusText = '已关闭';
  if (item.status === ISSUE_TRACKING_STATUS.IN_PROGRESS) statusText = '处理中';
  if (item.status === ISSUE_TRACKING_STATUS.RESOLVED) statusText = '待验证';
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
  const mappedIssues = reportIssues.map((issue) => mapIssueToDto(issue));
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
        status: body.status ? parseIssueStatus(body.status) : undefined,
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
    const data = await this.getIssues(params);
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Commissioning Issues');
    sheet.columns = [
      { header: '日期', key: 'date', width: 14 },
      { header: '工单号', key: 'workOrderNumber', width: 18 },
      { header: '项目名称', key: 'projectName', width: 20 },
      { header: '部件名称', key: 'partName', width: 18 },
      { header: '问题描述', key: 'description', width: 30 },
      { header: '责任部门', key: 'responsibleDepartment', width: 16 },
      { header: '严重程度', key: 'severity', width: 12 },
      { header: '状态', key: 'status', width: 12 },
      { header: '是否索赔', key: 'isClaim', width: 12 },
      { header: '预计损失', key: 'lossAmount', width: 14 },
      { header: '已索赔金额', key: 'recoveredAmount', width: 14 },
      { header: '索赔状态', key: 'claimStatus', width: 14 },
      { header: '索赔备注', key: 'claimNotes', width: 24 },
      { header: '处理建议', key: 'solution', width: 30 },
      { header: '照片', key: IMAGE_COLUMN_KEY, width: 14 },
    ];

    for (const item of data.items) {
      const row = sheet.addRow({
        date: item.date,
        workOrderNumber: item.workOrderNumber || '',
        projectName: item.projectName || '',
        partName: item.partName || '',
        description: item.description || '',
        responsibleDepartment: item.responsibleDepartment || '',
        severity: getSeverityLabel(item.severity),
        status: getStatusLabel(item.status),
        isClaim: item.isClaim ? '是' : '否',
        lossAmount: item.lossAmount || 0,
        recoveredAmount: item.recoveredAmount || 0,
        claimStatus: item.claimStatus || '',
        claimNotes: item.claimNotes || '',
        solution: item.solution || '',
        [IMAGE_COLUMN_KEY]: '',
      });
      const photo = item.photos?.[0];
      row.height = photo ? 52 : undefined;
      if (!photo) continue;
      try {
        const image = await loadImageForExcel(photo);
        if (!image) {
          row.getCell(IMAGE_COLUMN_KEY).value = photo;
          continue;
        }
        const imageId = workbook.addImage({
          base64: image.base64,
          extension: image.extension,
        });
        sheet.addImage(imageId, {
          tl: { col: 14.15, row: row.number - 1 + 0.1 },
          ext: IMAGE_SIZE,
        });
      } catch {
        row.getCell(IMAGE_COLUMN_KEY).value = photo;
      }
    }

    sheet.getRow(1).font = { bold: true };
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  async createDailyReport(payload: VehicleCommissioningDailyReportPayload) {
    const normalizedMainWorks = payload.mainWorks.map((item) =>
      normalizeMainWorkItem(item),
    );
    const reportIssues = await resolveReportIssues(payload);
    const mappedIssues = reportIssues.map((row) => mapIssueToDto(row));
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

  async createIssue(
    payload: Partial<VehicleCommissioningIssue>,
    operatorUserId?: string,
  ) {
    const now = new Date();
    const status = parseIssueStatus(payload.status);
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
        issuePhoto: normalizePhotos(payload.photos),
        isClaim: Boolean(payload.isClaim),
        lossAmount: safeNumber(payload.lossAmount),
        recoveredAmount: safeNumber(payload.recoveredAmount),
        claimStatus: payload.claimStatus || DEFAULT_CLAIM_STATUS,
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

    return mapIssueToDto(row);
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
        : parseIssueStatus(payload.status);
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
      await SystemLogService.auditLog('vehicle-commissioning', 'issueUpdate', {
        detailsVariables: {
          issue: row.description || row.id,
          status: String(row.status || ''),
        },
        targetId: row.id,
        userId: operatorUserId,
      });
    }

    return mapIssueToDto(row);
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
        status: body.status ? parseIssueStatus(body.status) : undefined,
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
