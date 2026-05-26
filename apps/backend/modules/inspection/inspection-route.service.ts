import type { Prisma } from '@prisma/client';
import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import process from 'node:process';

import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/governance/master-data/master-data-governance-write';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/governance/master-data/process-resolver';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { buildInspectionFormProcessFilter } from '~/modules/inspection/inspection-form';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';

import {
  buildInspectionRecordFromRequest,
  INSPECTION_REQUEST_STATUS,
  mapInspectionRequest,
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
  resolveInspectionRequestCurrentUserId,
} from './inspection-request';

const INSPECTION_EXECUTION_CODES = new Set(['QMS:Inspection:Requests:Close']);

function fail(prefix: string, message: string): never {
  throw new Error(`${prefix}:${message}`);
}

function parseCloseRequestNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireLinkedIssueText(
  linkedIssue: Record<string, unknown>,
  key: string,
  label: string,
) {
  if (!normalizeInspectionRequestText(linkedIssue[key])) {
    fail('VALIDATION', `不合格项${label}不能为空`);
  }
}

function validateCloseRequestBody(body: Record<string, unknown>) {
  const result = normalizeInspectionRequestText(body.result).toUpperCase();
  if (result !== 'PASS' && result !== 'FAIL')
    fail('VALIDATION', '检验结果必须为合格或不合格');
  const closeAttachments = normalizeInspectionRequestAttachments(
    body.attachments,
  );
  if (closeAttachments.length === 0) fail('VALIDATION', '检验记录不能为空');
  const quantity = parseInspectionRequestQuantity(body.quantity);
  const rawUnqualifiedQuantity = parseCloseRequestNumber(
    body.unqualifiedQuantity,
    result === 'FAIL' ? quantity : 0,
  );
  const unqualifiedQuantity = Math.max(
    0,
    Math.min(quantity, rawUnqualifiedQuantity),
  );
  if (result === 'PASS' && unqualifiedQuantity > 0)
    fail('VALIDATION', '检验结果为合格时，不合格数量必须为 0');
  if (result !== 'FAIL') return;
  if (unqualifiedQuantity <= 0)
    fail('VALIDATION', '检验结果为不合格时，不合格数量必须大于 0');
  if (!body.linkedIssue || typeof body.linkedIssue !== 'object')
    fail('VALIDATION', '检验结果为不合格时必须填写不合格项信息');
  const linkedIssue = body.linkedIssue as Record<string, unknown>;
  for (const [key, label] of [
    ['partName', '组件名称'],
    ['processName', '工序'],
    ['responsibleDepartment', '责任部门'],
    ['defectType', '缺陷分类'],
    ['defectSubtype', '二级分类'],
    ['severity', '严重程度'],
    ['status', '状态'],
    ['description', '不合格描述'],
    ['rootCause', '原因分析'],
    ['solution', '解决方案'],
  ] as const) {
    requireLinkedIssueText(linkedIssue, key, label);
  }
}

function stringifyCloseInspectionDocuments(
  attachments: ReturnType<typeof normalizeInspectionRequestAttachments>,
) {
  return attachments.length > 0 ? JSON.stringify(attachments) : null;
}

function buildLinkedIssueWhere(
  request: { linkedIssueId?: null | string; linkedIssueNo?: null | string },
  issueId?: null | string,
): null | Prisma.quality_recordsWhereInput {
  const ids = [
    normalizeInspectionRequestText(issueId),
    normalizeInspectionRequestText(request.linkedIssueId),
  ].filter(Boolean);
  const issueNo = normalizeInspectionRequestText(request.linkedIssueNo);
  const OR: Prisma.quality_recordsWhereInput[] = [];
  if (ids.length > 0) OR.push({ id: { in: [...new Set(ids)] } });
  if (issueNo) OR.push({ nonConformanceNumber: issueNo });
  return OR.length > 0 ? { isDeleted: false, OR } : null;
}

async function runClosePostCommitTask(
  label: string,
  task: () => Promise<unknown>,
) {
  try {
    await task();
  } catch (error) {
    logApiError(`inspection-request-close-${label}`, error);
  }
}

function getShanghaiTodayRange(now = new Date()) {
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(now);
  const start = new Date(`${shanghaiDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { end, start };
}

function parseShanghaiDate(value?: null | string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatShanghaiDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(date);
}

function getPeriodRange(period?: null | string, now = new Date()) {
  const today = getShanghaiTodayRange(now).start;
  switch (period) {
    case 'halfYear': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 5, 1);
      return { end: addDays(today, 1), start };
    }
    case 'quarter': {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 2, 1);
      return { end: addDays(today, 1), start };
    }
    case 'year': {
      const start = new Date(today);
      start.setMonth(0, 1);
      return { end: addDays(today, 1), start };
    }
    default: {
      const start = new Date(today);
      start.setDate(1);
      return { end: addDays(today, 1), start };
    }
  }
}

function resolveStatsRange(query: {
  endDate?: string;
  period?: string;
  startDate?: string;
}) {
  const customStart = parseShanghaiDate(query.startDate || '');
  const customEnd = parseShanghaiDate(query.endDate || '');
  if (customStart && customEnd && customEnd >= customStart)
    return { end: addDays(customEnd, 1), start: customStart };
  return query.period ? getPeriodRange(query.period) : getShanghaiTodayRange();
}

function durationMinutes(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 60_000);
}

function hasInspectionExecutionCode(codes: string[]) {
  return codes.some((code) => INSPECTION_EXECUTION_CODES.has(code));
}

export const InspectionRouteService = {
  async closeRequest(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    try {
      validateCloseRequestBody(body);
      const explicitInspectionId = normalizeInspectionRequestText(
        body.inspectionId,
      );
      const request = await prisma.qms_inspection_requests.findFirst({
        include: {
          process: { select: { name: true } },
          work_order: { select: { projectName: true } },
        },
        where: { id, isDeleted: false },
      });
      if (!request) fail('NOT_FOUND', '报检任务不存在');
      if (request.status === INSPECTION_REQUEST_STATUS.CLOSED)
        fail('BAD_REQUEST', '报检任务已检验完成');

      let inspectionId = explicitInspectionId;
      if (inspectionId) {
        const inspection = await prisma.inspections.findFirst({
          select: { id: true },
          where: {
            id: inspectionId,
            isDeleted: false,
            workOrderNumber: request.workOrderNumber,
          },
        });
        if (!inspection)
          fail('BAD_REQUEST', '关联的检验记录不存在，或工单号与报检任务不一致');
      } else {
        const inspection = await buildInspectionRecordFromRequest(
          request,
          body,
        );
        inspectionId = String(inspection.id);
      }

      const closeAttachments = normalizeInspectionRequestAttachments(
        body.attachments,
      );
      const result = normalizeInspectionRequestText(body.result).toUpperCase();
      const linkedIssue = body.linkedIssue as
        | Record<string, unknown>
        | undefined;
      const totalQuantity = parseInspectionRequestQuantity(
        body.quantity,
        request.quantity || 1,
      );
      const unqualifiedQuantity =
        result === 'FAIL'
          ? Math.max(
              1,
              Math.min(
                totalQuantity,
                Math.trunc(
                  parseCloseRequestNumber(body.unqualifiedQuantity, 1),
                ),
              ),
            )
          : 0;
      const qualifiedQuantity = Math.max(
        0,
        totalQuantity - unqualifiedQuantity,
      );
      const shouldCloseRequest = result === 'PASS';
      let issueCreateData: Prisma.quality_recordsCreateInput | undefined;
      let issueAuditVariables:
        | undefined
        | { issue: string; nonConformanceNumber: string };
      const closeInspectorId =
        request.inspectorId ||
        (await resolveInspectionRequestCurrentUserId(userinfo, prisma));

      if (result === 'FAIL' && linkedIssue && inspectionId) {
        const issueUtils = await import('./inspection-issue');
        const linkedInspection =
          await issueUtils.findInspectionForIssue(inspectionId);
        const newId = issueUtils.createInspectionIssueId();
        const serialNumber =
          await issueUtils.getNextInspectionIssueSerialNumber();
        const issueQuantity = Math.max(
          1,
          Math.trunc(
            parseCloseRequestNumber(
              linkedIssue.quantity,
              parseCloseRequestNumber(body.unqualifiedQuantity, 1),
            ),
          ),
        );
        const governedIssueFields = buildGovernedWriteFieldsForTable(
          'quality_records',
          {
            defectSubtype: normalizeInspectionRequestText(
              linkedIssue.defectSubtype,
            ),
            defectType:
              normalizeInspectionRequestText(linkedIssue.defectType) ||
              '制造缺陷',
            division:
              normalizeInspectionRequestText(linkedIssue.division) ||
              linkedInspection?.work_order?.division ||
              undefined,
          },
        );
        const issueBody = {
          claim: normalizeInspectionRequestText(linkedIssue.claim) || 'No',
          ...governedIssueFields,
          description: normalizeInspectionRequestText(linkedIssue.description),
          inspectionId,
          lossAmount: Number(linkedIssue.lossAmount || 0),
          partName:
            normalizeInspectionRequestText(linkedIssue.partName) ||
            normalizeInspectionRequestText(request.componentName) ||
            request.partName,
          processName:
            normalizeInspectionRequestText(linkedIssue.processName) ||
            normalizeInspectionRequestText(
              resolveCanonicalProcessName(request),
            ) ||
            request.processName,
          projectName:
            request.work_order?.projectName || request.workOrderNumber,
          quantity: issueQuantity,
          reportDate: normalizeInspectionRequestText(linkedIssue.reportDate),
          reportedBy:
            normalizeInspectionRequestText(linkedIssue.reportedBy) ||
            request.reporter,
          responsibleDepartment:
            normalizeInspectionRequestText(linkedIssue.responsibleDepartment) ||
            '生产 OBU',
          responsibleWelder:
            normalizeInspectionRequestText(linkedIssue.responsibleWelder) ||
            undefined,
          rootCause: normalizeInspectionRequestText(linkedIssue.rootCause),
          severity:
            normalizeInspectionRequestText(linkedIssue.severity) || 'Minor',
          solution: normalizeInspectionRequestText(linkedIssue.solution),
          status: normalizeInspectionRequestText(linkedIssue.status) || 'OPEN',
          supplierName: normalizeInspectionRequestText(
            linkedIssue.supplierName,
          ),
          sourceType: 'INSPECTION_REQUEST',
          photos: Array.isArray(linkedIssue.photos) ? linkedIssue.photos : [],
          workOrderNumber: request.workOrderNumber,
        };
        issueCreateData = await issueUtils.buildInspectionIssueCreateData(
          issueBody,
          {
            id: newId,
            inspection: linkedInspection,
            inspectorUsername: userinfo.username,
            serialNumber,
          },
        );
        issueAuditVariables = {
          issue: issueBody.partName,
          nonConformanceNumber: newId,
        };
      }

      const {
        closedLinkedIssueCount,
        issue,
        record: updated,
      } = await prisma.$transaction(async (tx) => {
        const issueRecord = issueCreateData
          ? await tx.quality_records.create({ data: issueCreateData })
          : null;
        const linkedIssueWhere = buildLinkedIssueWhere(
          request,
          issueRecord?.id,
        );
        let linkedIssueStatus =
          issueRecord?.status || request.linkedIssueStatus || null;
        let closedLinkedIssueCount = 0;
        if (shouldCloseRequest && linkedIssueWhere) {
          const linkedIssueUpdate = await tx.quality_records.updateMany({
            data: { status: 'CLOSED' },
            where: { ...linkedIssueWhere, status: { not: 'CLOSED' } },
          });
          closedLinkedIssueCount = linkedIssueUpdate.count;
          linkedIssueStatus = 'CLOSED';
        }
        if (explicitInspectionId && inspectionId) {
          await tx.inspections.update({
            data: {
              inspector:
                normalizeInspectionRequestText(body.inspector) ||
                request.reporter,
              quantity: totalQuantity,
              qualifiedQuantity,
              remarks:
                normalizeInspectionRequestText(body.closeRemark) ||
                request.requestInfo,
              result: result === 'FAIL' ? 'FAIL' : 'PASS',
              unqualifiedQuantity,
            },
            where: { id: inspectionId },
          });
        }
        const record = await tx.qms_inspection_requests.update({
          data: {
            closeAttachments:
              closeAttachments.length > 0
                ? JSON.stringify(closeAttachments)
                : null,
            closeRemark:
              normalizeInspectionRequestText(body.closeRemark) || null,
            closedAt: shouldCloseRequest ? new Date() : null,
            inspectionId,
            inspectionResult: result === 'FAIL' ? 'FAIL' : 'PASS',
            inspectorId: closeInspectorId || request.inspectorId,
            linkedIssueId: issueRecord?.id || request.linkedIssueId || null,
            linkedIssueNo:
              issueRecord?.nonConformanceNumber ||
              request.linkedIssueNo ||
              null,
            linkedIssueStatus,
            qualifiedQuantity,
            status: shouldCloseRequest
              ? INSPECTION_REQUEST_STATUS.CLOSED
              : INSPECTION_REQUEST_STATUS.INSPECTING,
            unqualifiedQuantity,
          },
          include: {
            dispatcher: { select: { realName: true, username: true } },
            inspection: {
              select: {
                qualifiedQuantity: true,
                result: true,
                unqualifiedQuantity: true,
              },
            },
            inspector: { select: { realName: true, username: true } },
            process: { select: { name: true } },
          },
          where: { id },
        });
        if (record.dispatchTaskId) {
          await tx.qms_task_dispatches.updateMany({
            data: { status: shouldCloseRequest ? 'COMPLETED' : 'PROCESSING' },
            where: { id: record.dispatchTaskId },
          });
        }
        return { closedLinkedIssueCount, issue: issueRecord, record };
      });

      await runClosePostCommitTask('request-file-references', () =>
        FileStorageService.registerReferencesFromAttachments({
          attachments: closeAttachments,
          bizId: String(updated.id),
          bizType: 'inspection_request',
          fieldName: 'closeAttachments',
        }),
      );
      const currentInspection = await prisma.inspections.findUnique({
        select: { documents: true },
        where: { id: inspectionId },
      });
      const inspectionDocuments = mergeInspectionRequestAttachments(
        currentInspection?.documents,
        closeAttachments,
      );
      await runClosePostCommitTask('inspection-documents', async () => {
        await prisma.inspections.update({
          data: {
            documents: stringifyCloseInspectionDocuments(inspectionDocuments),
            hasDocuments: inspectionDocuments.length > 0,
          },
          where: { id: inspectionId },
        });
        await FileStorageService.registerReferencesFromAttachments({
          attachments: inspectionDocuments,
          bizId: String(inspectionId),
          bizType: 'inspection_record',
          fieldName: 'documents',
        });
      });
      if (issue && linkedIssue?.photos !== undefined) {
        await runClosePostCommitTask('issue-file-references', () =>
          FileStorageService.registerReferencesFromAttachments({
            attachments: linkedIssue.photos,
            bizId: String(issue.id),
            bizType: 'inspection_issue',
            fieldName: 'photos',
          }),
        );
      }
      if (issue || closedLinkedIssueCount > 0) {
        const { SystemLogService } = await import(
          '~/modules/system-log/system-log.service'
        );
        const { WelderScoreService } = await import(
          '~/modules/welder/welder-score.service'
        );
        if (issue) {
          await runClosePostCommitTask('issue-audit-log', () =>
            SystemLogService.auditLog('inspection', 'issueCreateFromClose', {
              userId: String(userinfo.id),
              targetId: String(issue.id),
              detailsVariables: {
                issue: issueAuditVariables?.issue || issue.partName,
                nonConformanceNumber:
                  issueAuditVariables?.nonConformanceNumber ||
                  issue.nonConformanceNumber ||
                  '无编号',
              },
            }),
          );
        }
        if (closedLinkedIssueCount > 0 && updated.linkedIssueId) {
          await runClosePostCommitTask('linked-issue-close-audit-log', () =>
            SystemLogService.auditLog('inspection', 'issueCloseLinked', {
              userId: String(userinfo.id),
              targetId: String(updated.linkedIssueId),
              detailsVariables: {
                linkedIssue: updated.linkedIssueNo || updated.linkedIssueId,
              },
            }),
          );
        }
        await runClosePostCommitTask('welder-score-sync', () =>
          WelderScoreService.syncFromInspectionIssues(),
        );
      }

      await recordBusinessAuditLog(event, {
        action: 'UPDATE',
        detailsTemplate:
          '关闭报检任务: {{requestNo}}，关联检验记录: {{inspectionId}}',
        detailsVariables: { inspectionId, requestNo: updated.requestNo },
        targetId: String(updated.id),
        targetType: 'inspection_request',
        userId: userinfo?.id,
      });
      return mapInspectionRequest(updated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('VALIDATION:'))
        throw error;
      const message =
        error instanceof Error ? String(error.message || '').trim() : '';
      if (
        process.env.NODE_ENV === 'development' &&
        message &&
        !message.includes(':')
      ) {
        fail('INTERNAL', `关闭报检任务失败：${message}`);
      }
      throw error;
    }
  },

  async getRequestStats(query: {
    endDate?: string;
    period?: string;
    startDate?: string;
  }) {
    const { end, start } = resolveStatsRange(query);
    const [
      periodRequests,
      activeInspectorRequests,
      pendingDispatchCount,
      pendingInspectionCount,
      activeUsers,
    ] = await Promise.all([
      prisma.qms_inspection_requests.findMany({
        include: {
          inspector: { select: { id: true, realName: true, username: true } },
        },
        where: {
          OR: [
            { submittedAt: { gte: start, lt: end } },
            { closedAt: { gte: start, lt: end } },
          ],
          isDeleted: false,
        },
      }),
      prisma.qms_inspection_requests.findMany({
        include: {
          inspector: { select: { id: true, realName: true, username: true } },
        },
        where: {
          inspectorId: { not: null },
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
      }),
      prisma.qms_inspection_requests.count({
        where: { isDeleted: false, status: 'SUBMITTED' },
      }),
      prisma.qms_inspection_requests.count({
        where: {
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
      }),
      prisma.users.findMany({
        where: { isDeleted: false, status: 'ACTIVE' },
        select: {
          id: true,
          realName: true,
          username: true,
          roles: {
            select: {
              name: true,
              rbac_role_permissions: {
                select: { permission: { select: { code: true } } },
              },
            },
          },
          rbac_user_roles: {
            select: {
              role: {
                select: {
                  name: true,
                  rbac_role_permissions: {
                    select: { permission: { select: { code: true } } },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const now = new Date();
    const inspectorStatusMap = new Map<
      string,
      {
        activeTaskCount: number;
        averageTaskMinutes: number;
        completedTaskCount: number;
        currentTaskMinutes: number;
        inspector: string;
        status: 'BUSY' | 'IDLE';
        totalTaskMinutes: number;
      }
    >();
    const createInspectorStatus = (inspector: string) => ({
      activeTaskCount: 0,
      averageTaskMinutes: 0,
      completedTaskCount: 0,
      currentTaskMinutes: 0,
      inspector,
      status: 'IDLE' as const,
      totalTaskMinutes: 0,
    });
    const collectRolePermissionCodes = (role?: {
      rbac_role_permissions?: Array<{
        permission?: null | { code?: null | string };
      }>;
    }) =>
      role
        ? (role.rbac_role_permissions || [])
            .map((item) => item.permission?.code || '')
            .filter(Boolean)
        : [];
    const isInspectorUser = (user: (typeof activeUsers)[number]) =>
      [
        user.roles,
        ...user.rbac_user_roles.map((link) => link.role).filter(Boolean),
      ].some((role) =>
        hasInspectionExecutionCode(collectRolePermissionCodes(role)),
      );
    for (const user of activeUsers.filter((item) => isInspectorUser(item)))
      inspectorStatusMap.set(
        user.id,
        createInspectorStatus(user.realName || user.username || '未记录检验员'),
      );
    const resolveInspectorKey = (item: (typeof periodRequests)[number]) =>
      item.inspectorId ||
      item.inspector?.username ||
      item.inspector?.realName ||
      'unknown';
    const resolveInspectorName = (item: (typeof periodRequests)[number]) =>
      item.inspector?.realName || item.inspector?.username || '未记录检验员';
    const getInspectorStatus = (item: (typeof periodRequests)[number]) => {
      const key = resolveInspectorKey(item);
      const existing = inspectorStatusMap.get(key);
      if (existing) return existing;
      const created = createInspectorStatus(resolveInspectorName(item));
      inspectorStatusMap.set(key, created);
      return created;
    };
    for (const item of activeInspectorRequests) {
      if (!item.inspectorId) continue;
      const stat = getInspectorStatus(item);
      stat.activeTaskCount += 1;
      stat.status = 'BUSY';
      stat.currentTaskMinutes = Math.max(
        stat.currentTaskMinutes,
        durationMinutes(item.dispatchedAt || item.submittedAt, now),
      );
    }
    for (const item of periodRequests) {
      if (item.closedAt && item.closedAt >= start && item.closedAt < end) {
        const stat = getInspectorStatus(item);
        const taskMinutes = durationMinutes(
          item.dispatchedAt || item.submittedAt,
          item.closedAt,
        );
        stat.completedTaskCount += 1;
        stat.totalTaskMinutes += taskMinutes;
        stat.averageTaskMinutes = Math.round(
          stat.totalTaskMinutes / stat.completedTaskCount,
        );
      }
    }
    const inspectorStatus = [...inspectorStatusMap.values()]
      .filter((item) => item.inspector !== '未记录检验员')
      .sort((a, b) => {
        if (a.status === b.status) {
          return (
            b.activeTaskCount - a.activeTaskCount ||
            b.completedTaskCount - a.completedTaskCount
          );
        }
        return a.status === 'BUSY' ? -1 : 1;
      });
    const teamMap = new Map<string, number>();
    const inspectorMap = new Map<string, number>();
    const historyTeamMap = new Map<string, number>();
    const teamReinspectionMap = new Map<
      string,
      {
        inspectedCount: number;
        reinspectionCount: number;
        reinspectionRate: number;
        submittedCount: number;
        team: string;
      }
    >();
    const historyInspectorMap = new Map<
      string,
      {
        averageTaskMinutes: number;
        completedTaskCount: number;
        inspector: string;
        totalTaskMinutes: number;
      }
    >();
    const dailyTrendMap = new Map<
      string,
      { closedCount: number; date: string; submittedCount: number }
    >();
    let todaySubmittedCount = 0;
    let todayClosedCount = 0;
    for (
      let cursor = new Date(start);
      cursor < end;
      cursor = addDays(cursor, 1)
    ) {
      const date = formatShanghaiDate(cursor);
      dailyTrendMap.set(date, { closedCount: 0, date, submittedCount: 0 });
    }
    for (const item of periodRequests) {
      if (
        item.submittedAt >= start &&
        item.submittedAt < end &&
        item.status !== 'CANCELLED'
      ) {
        todaySubmittedCount += 1;
        const date = formatShanghaiDate(item.submittedAt);
        const daily = dailyTrendMap.get(date);
        if (daily) daily.submittedCount += 1;
        const team = String(item.team || '未填写班组').trim();
        teamMap.set(team, (teamMap.get(team) || 0) + 1);
        historyTeamMap.set(team, (historyTeamMap.get(team) || 0) + 1);
        const reinspectionStat = teamReinspectionMap.get(team) || {
          inspectedCount: 0,
          reinspectionCount: 0,
          reinspectionRate: 0,
          submittedCount: 0,
          team,
        };
        reinspectionStat.submittedCount += 1;
        const hasReinspection =
          Boolean(item.linkedIssueId || item.linkedIssueNo) ||
          item.inspectionResult === 'FAIL';
        const hasInspectionResult = item.status === 'CLOSED' || hasReinspection;
        if (hasInspectionResult) reinspectionStat.inspectedCount += 1;
        if (hasReinspection) reinspectionStat.reinspectionCount += 1;
        reinspectionStat.reinspectionRate =
          reinspectionStat.inspectedCount > 0
            ? Math.round(
                (reinspectionStat.reinspectionCount /
                  reinspectionStat.inspectedCount) *
                  1000,
              ) / 10
            : 0;
        teamReinspectionMap.set(team, reinspectionStat);
      }
      if (
        item.closedAt &&
        item.closedAt >= start &&
        item.closedAt < end &&
        item.status === 'CLOSED'
      ) {
        todayClosedCount += 1;
        const date = formatShanghaiDate(item.closedAt);
        const daily = dailyTrendMap.get(date);
        if (daily) daily.closedCount += 1;
        const inspector =
          item.inspector?.realName ||
          item.inspector?.username ||
          '未记录检验员';
        inspectorMap.set(inspector, (inspectorMap.get(inspector) || 0) + 1);
        const existing = historyInspectorMap.get(inspector) || {
          averageTaskMinutes: 0,
          completedTaskCount: 0,
          inspector,
          totalTaskMinutes: 0,
        };
        const taskMinutes = durationMinutes(
          item.dispatchedAt || item.submittedAt,
          item.closedAt,
        );
        existing.completedTaskCount += 1;
        existing.totalTaskMinutes += taskMinutes;
        existing.averageTaskMinutes = Math.round(
          existing.totalTaskMinutes / existing.completedTaskCount,
        );
        historyInspectorMap.set(inspector, existing);
      }
    }
    return {
      byInspector: [...inspectorMap.entries()]
        .map(([inspector, count]) => ({ count, inspector }))
        .sort((a, b) => b.count - a.count),
      byTeam: [...teamMap.entries()]
        .map(([team, count]) => ({ count, team }))
        .sort((a, b) => b.count - a.count),
      dailyTrend: [...dailyTrendMap.values()],
      historyByInspector: [...historyInspectorMap.values()]
        .filter((item) => item.inspector !== '未记录检验员')
        .sort((a, b) => b.completedTaskCount - a.completedTaskCount),
      historyByTeam: [...historyTeamMap.entries()]
        .map(([team, count]) => ({ count, team }))
        .sort((a, b) => b.count - a.count),
      inspectorStatus,
      pendingDispatchCount,
      pendingInspectionCount,
      reinspectionRateByTeam: [...teamReinspectionMap.values()].sort(
        (a, b) =>
          b.reinspectionRate - a.reinspectionRate ||
          b.reinspectionCount - a.reinspectionCount ||
          b.inspectedCount - a.inspectedCount ||
          b.submittedCount - a.submittedCount,
      ),
      todayClosedCount,
      todaySubmittedCount,
    };
  },

  async updateInspectionFormTemplate(
    id: string,
    body: Record<string, unknown>,
    userinfo: { username?: string },
  ) {
    const current = await prisma.inspection_form_templates.findUnique({
      where: { id },
      select: {
        partName: true,
        processId: true,
        process: { select: { name: true } },
        processName: true,
        status: true,
        workOrderNumber: true,
      },
    });
    if (!current) fail('NOT_FOUND', '检验表不存在');
    const workOrderNumber =
      body.workOrderNumber === undefined
        ? undefined
        : String(body.workOrderNumber || '').trim();
    const processName =
      body.processName === undefined
        ? undefined
        : String(body.processName || '').trim();
    const partName =
      body.partName === undefined
        ? undefined
        : String(body.partName || '').trim();
    const status =
      body.status === undefined
        ? undefined
        : String(body.status || '').trim() || 'active';
    const formNo =
      body.formNo === undefined ? undefined : String(body.formNo || '').trim();
    const drawingNo =
      body.drawingNo === undefined
        ? undefined
        : String(body.drawingNo || '').trim();
    const templateQuantity =
      body.templateQuantity === undefined
        ? undefined
        : Number(body.templateQuantity);
    const finalStatus = status ?? String(current.status || '').trim();
    const currentProcessName = resolveCanonicalProcessName(current) || '';
    if (finalStatus === 'active') {
      const finalWorkOrderNumber = workOrderNumber ?? current?.workOrderNumber;
      const finalProcessName = processName ?? currentProcessName;
      const finalPartName = partName ?? String(current?.partName || '').trim();
      if (finalWorkOrderNumber && finalProcessName) {
        const processFilter = await buildInspectionFormProcessFilter({
          category: 'PROCESS',
          processId: processName === undefined ? current.processId : null,
          processName: finalProcessName,
        });
        const duplicatedActiveTemplate =
          await prisma.inspection_form_templates.findFirst({
            where: {
              id: { not: id },
              isDeleted: false,
              ...(finalPartName
                ? { partName: finalPartName }
                : { OR: [{ partName: null }, { partName: '' }] }),
              ...processFilter,
              status: 'active',
              workOrderNumber: finalWorkOrderNumber,
            },
            select: { id: true },
          });
        if (duplicatedActiveTemplate)
          fail(
            'CONFLICT',
            '同一工单同一工序已存在启用中的检验表模板，请先停用旧模板',
          );
      }
    }
    const processNameChanged =
      processName !== undefined && processName !== currentProcessName;
    let normalizedTemplateQuantity: null | number | undefined;
    if (templateQuantity === undefined) {
      normalizedTemplateQuantity = undefined;
    } else if (Number.isFinite(templateQuantity) && templateQuantity > 0) {
      normalizedTemplateQuantity = Math.trunc(templateQuantity);
    } else {
      normalizedTemplateQuantity = null;
    }
    let resolvedProcessId: string | undefined;
    if (processName === undefined) {
      resolvedProcessId = undefined;
    } else if (processNameChanged) {
      resolvedProcessId = await resolveProcessIdForWrite({ processName });
    } else {
      resolvedProcessId = undefined;
    }
    const governedFields = buildGovernedWriteFieldsForTable(
      'inspection_form_templates',
      {
        formName:
          body.formName === undefined
            ? undefined
            : String(body.formName || '').trim(),
        partName: partName === undefined ? undefined : partName || null,
        processName: processName === undefined ? undefined : processName,
        projectName:
          body.projectName === undefined
            ? undefined
            : String(body.projectName || '').trim() || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'inspection_form_templates',
      {
        formName:
          governedFields.formName === undefined
            ? undefined
            : governedFields.formName,
      },
    );
    const updated = await prisma.inspection_form_templates.update({
      where: { id },
      data: {
        attachments:
          body.attachments === undefined
            ? undefined
            : String(body.attachments || '').trim() || null,
        formFields:
          body.formFields === undefined
            ? undefined
            : JSON.stringify(body.formFields || []),
        formName:
          governedFields.formName === undefined
            ? undefined
            : governedFields.formName,
        formNo: formNo === undefined ? undefined : formNo || null,
        processId: resolvedProcessId,
        partName:
          governedFields.partName === undefined
            ? undefined
            : governedFields.partName,
        processName:
          governedFields.processName === undefined
            ? undefined
            : governedFields.processName,
        projectName:
          governedFields.projectName === undefined
            ? undefined
            : governedFields.projectName,
        ...governedCanonicalIds,
        templateQuantity: normalizedTemplateQuantity,
        drawingNo: drawingNo === undefined ? undefined : drawingNo || null,
        status: status === undefined ? undefined : status,
        updatedAt: new Date(),
        updatedBy: userinfo.username,
        workOrderNumber:
          workOrderNumber === undefined ? undefined : workOrderNumber,
      },
    });
    if (body.attachments !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.attachments,
        bizId: id,
        bizType: 'inspection_form_template',
      });
    }
    return updated;
  },
};
