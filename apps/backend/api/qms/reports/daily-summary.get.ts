import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '~/utils/inspection-form';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  formatReportDate,
  getReportDayRange,
  resolveReportQueryDate,
} from '~/utils/report';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

function parseDailySummaryContent(summary?: null | string) {
  if (!summary) {
    return { summary: '' };
  }
  try {
    const parsed = JSON.parse(summary) as { summary?: string };
    if (parsed && typeof parsed === 'object') {
      return {
        summary: String(parsed.summary || ''),
      };
    }
  } catch {
    return { summary: String(summary || '') };
  }
  return { summary: String(summary || '') };
}

function mapArchiveStatusLabel(status?: string) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  if (normalized === 'TEMPLATE_MISSING') return '检验表未编制';
  if (normalized === 'ARCHIVED') return '已归档';
  if (normalized === 'IN_PROGRESS') return '整理中';
  if (normalized === 'REJECTED') return '已退回';
  return '待整理';
}

type DailyInspectionRow = {
  category: string;
  id: string;
  incomingType?: null | string;
  inspectionDate?: Date;
  processName?: null | string;
  projectName?: null | string;
  workOrderNumber: string;
};

type ArchiveTaskRow = Awaited<
  ReturnType<typeof prisma.inspection_archive_tasks.findMany>
>[number];

async function loadDailyArchiveTasks(inspections: DailyInspectionRow[]) {
  try {
    const inspectionIds = inspections.map((item) => item.id).filter(Boolean);
    const workOrderNumbers = [
      ...new Set(
        inspections
          .map((item) => String(item.workOrderNumber || '').trim())
          .filter(Boolean),
      ),
    ];

    const [tasks, templates] = await Promise.all([
      inspectionIds.length > 0
        ? prisma.inspection_archive_tasks.findMany({
            where: {
              isDeleted: false,
              inspectionId: {
                in: inspectionIds,
              },
            },
            include: {
              inspection: {
                select: {
                  category: true,
                  incomingType: true,
                  processName: true,
                },
              },
            },
            orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }],
          })
        : Promise.resolve([]),
      workOrderNumbers.length > 0
        ? prisma.inspection_form_templates.findMany({
            where: {
              isDeleted: false,
              status: 'active',
              workOrderNumber: {
                in: workOrderNumbers,
              },
            },
            select: {
              id: true,
              processName: true,
              workOrderNumber: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const planProcessMap = new Map<string, Set<string>>();
    for (const template of templates) {
      const workOrderNumber = String(template.workOrderNumber || '').trim();
      if (!workOrderNumber) continue;
      const stepSet = planProcessMap.get(workOrderNumber) || new Set<string>();
      const step = String(template.processName || '').trim();
      if (step) {
        stepSet.add(step);
      }
      planProcessMap.set(workOrderNumber, stepSet);
    }

    const taskMap = new Map(tasks.map((item) => [item.inspectionId, item]));
    const taskFallbackMap = new Map<string, ArchiveTaskRow[]>();
    for (const task of tasks) {
      const taskWorkOrder = String(task.workOrderNumber || '').trim();
      if (!taskWorkOrder || !task.inspection) continue;
      const candidates = resolveInspectionFormProcessCandidates({
        category: task.inspection.category || '',
        incomingType: task.inspection.incomingType || '',
        processName: task.inspection.processName || '',
      });
      for (const candidate of candidates) {
        const key = `${taskWorkOrder}::${candidate}`;
        const list = taskFallbackMap.get(key) || [];
        list.push(task);
        taskFallbackMap.set(key, list);
      }
    }
    const orderedInspections = [...inspections].sort((a, b) =>
      String(a.workOrderNumber || '').localeCompare(
        String(b.workOrderNumber || ''),
      ),
    );

    const now = new Date();
    let requiredCount = 0;
    let archivedCount = 0;
    let overdueCount = 0;
    let missingTemplateCount = 0;
    const engineeringTodos: Array<{
      processName: string;
      projectName: string;
      seq: number;
      status: string;
      workOrder: string;
    }> = [];
    const items = orderedInspections.map((inspection, index) => {
      const inspectionId = String(inspection.id || '').trim();
      const workOrder = String(inspection.workOrderNumber || '').trim();
      const processName = resolveInspectionFormProcess(inspection);
      const processCandidates =
        resolveInspectionFormProcessCandidates(inspection);
      const processSet = planProcessMap.get(workOrder);
      const hasTemplate = Boolean(
        processSet &&
          processCandidates.some((candidate) => processSet.has(candidate)),
      );
      let task = inspectionId ? taskMap.get(inspectionId) : undefined;
      if (!task && processCandidates.length > 0 && workOrder) {
        for (const candidate of processCandidates) {
          const key = `${workOrder}::${candidate}`;
          const matchedList = taskFallbackMap.get(key);
          if (matchedList && matchedList.length > 0) {
            task = matchedList[0];
            break;
          }
        }
      }

      let status = 'PENDING';
      let workContent = '';
      if (!hasTemplate) {
        status = 'TEMPLATE_MISSING';
        workContent = `${processName || '当前工序'}检验表未编制`;
        missingTemplateCount += 1;
        engineeringTodos.push({
          processName: processName || '-',
          projectName: String(inspection.projectName || ''),
          seq: engineeringTodos.length + 1,
          status: '待编制',
          workOrder,
        });
      } else if (task) {
        requiredCount += 1;
        status = String(task.status || 'PENDING').toUpperCase();
        if (status === 'ARCHIVED') {
          archivedCount += 1;
        } else if (now > task.dueAt) {
          overdueCount += 1;
        }
        workContent = String(task.workContent || '').trim();
      } else {
        requiredCount += 1;
        status = 'PENDING';
        workContent = `${processName || '当前工序'}检验表待归档`;
      }

      if (!workContent) {
        workContent = `${processName || '检验资料'}归档`;
      }

      return {
        projectName: String(inspection.projectName || ''),
        seq: index + 1,
        status: mapArchiveStatusLabel(status),
        workContent,
        workOrder,
      };
    });

    const timelinessRate =
      requiredCount > 0
        ? Number(((archivedCount / requiredCount) * 100).toFixed(2))
        : 0;

    return {
      engineeringTodos,
      items,
      stats: {
        archivedCount,
        missingTemplateCount,
        overdueCount,
        requiredCount,
        timelinessRate,
      },
    };
  } catch (error) {
    if (isPrismaSchemaMismatchError(error)) {
      return {
        engineeringTodos: [],
        items: [],
        stats: {
          archivedCount: 0,
          missingTemplateCount: 0,
          overdueCount: 0,
          requiredCount: 0,
          timelinessRate: 0,
        },
      };
    }
    throw error;
  }
}

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { date, user } = getQuery(event) as { date: string; user?: string };
  const { date: parsedQueryDate, valid: isDateValid } =
    resolveReportQueryDate(date);
  if (!isDateValid) {
    return badRequestResponse(event, 'Invalid date parameter');
  }
  const queryDate = formatReportDate(parsedQueryDate);
  const queryUser = user || userinfo.username;
  const realName = userinfo.realName;

  try {
    // 1. Fetch Inspection Records (Created by user on date)
    // Range: queryDate 00:00:00 to 23:59:59
    const { end: endDate, start: startDate } = getReportDayRange(
      new Date(queryDate),
    );

    const inspections = await prisma.inspections.findMany({
      where: {
        isDeleted: false,
        inspectionDate: {
          gte: startDate,
          lte: endDate,
        },
        OR: [{ inspector: queryUser }, { inspector: realName }],
      },
      include: {
        work_order: {
          select: {
            projectName: true,
            customerName: true,
          },
        },
      },
    });

    // 2. Fetch Engineering Issues (Exceptions)
    const issues = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        OR: [
          // Created today
          {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
            // And by this user
            OR: [{ inspector: queryUser }, { lastEditor: queryUser }],
          },
          // OR Open and by this user
          {
            status: { not: 'CLOSED' },
            OR: [{ inspector: queryUser }, { lastEditor: queryUser }],
          },
          // OR Closed Today and by this user
          {
            status: 'CLOSED',
            updatedAt: {
              gte: startDate,
              lte: endDate,
            },
            OR: [{ inspector: queryUser }, { lastEditor: queryUser }],
          },
        ],
      },
      include: {
        work_orders: {
          select: {
            projectName: true,
            customerName: true,
          },
        },
      },
    });

    // 3. Process inspections
    interface ProcessItem {
      partNames: Set<string>;
      process: string;
      projectName: string;
      quantity: number;
      results: Set<string>;
      workOrder: string;
    }
    const processMap = new Map<string, ProcessItem>();
    const formattedInspections: Array<{
      partName: string;
      process: string;
      projectName: string;
      quantity: number;
      result: string;
      seq: number;
      workOrder: string;
    }> = [];

    inspections.forEach((item) => {
      let proc = '';
      let name = '';

      // Determine Process Name and Part Name based on Category
      switch (item.category) {
        case 'INCOMING': {
          proc = '进货检验';
          name = item.materialName || '';

          break;
        }
        case 'PROCESS': {
          proc = item.processName || '';
          name = item.level2Component || item.level1Component || '';

          break;
        }
        case 'SHIPMENT': {
          proc = '发货检验';
          // 对应组件名称 - 优先取 materialName
          name =
            item.materialName ||
            item.level2Component ||
            item.level1Component ||
            '';

          break;
        }
        default: {
          // Fallback
          proc = item.processName || item.category || '';
          name = item.materialName || item.level1Component || '';
        }
      }

      const key = `${item.workOrderNumber}::${proc}`;

      if (!processMap.has(key)) {
        processMap.set(key, {
          partNames: new Set<string>(),
          process: proc,
          projectName: item.projectName || '', // Capture Project Name
          quantity: 0,
          results: new Set<string>(),
          workOrder: item.workOrderNumber,
        });
      }
      const group = processMap.get(key);

      // If project name was missing, try to fill it
      if (!group.projectName && item.projectName) {
        group.projectName = item.projectName;
      }

      if (name) group.partNames.add(name);

      group.quantity += item.quantity;
      group.results.add(item.result === 'PASS' ? '合格' : '不合格');
    });

    // Convert grouped process inspections to array
    for (const group of processMap.values()) {
      const resultStatus = group.results.has('不合格') ? '不合格' : '合格';

      formattedInspections.push({
        partName: [...group.partNames].join('、'),
        process: group.process, // Use the grouped process name
        projectName: group.projectName,
        quantity: group.quantity,
        result: resultStatus,
        seq: 0,
        workOrder: group.workOrder,
      });
    }

    // Re-assign sequence numbers
    formattedInspections.forEach((item, index) => {
      item.seq = index + 1;
    });

    const formattedIssues = issues.map((item, index) => {
      const created = new Date(item.createdAt);
      const isToday = created >= startDate && created <= endDate;
      return {
        dept: item.responsibleDepartment,
        description: item.description,
        isToday,
        partName: item.partName,
        projectName: item.projectName || item.work_orders?.projectName || '',
        seq: index + 1,
        solution: item.solution || '待定',
        status: item.status,
        workOrder: item.workOrderNumber,
      };
    });

    const dailyArchive = await loadDailyArchiveTasks(inspections);

    // Try to find an existing summary in daily_reports
    const existingReport = await prisma.daily_reports.findUnique({
      where: {
        date_reporter: {
          date: new Date(queryDate),
          reporter: queryUser,
        },
      },
    });

    const storedContent = parseDailySummaryContent(existingReport?.summary);

    return useResponseSuccess({
      archiveStats: dailyArchive.stats,
      date: queryDate,
      documentItems: dailyArchive.items,
      engineeringTodos: dailyArchive.engineeringTodos,
      inspections: formattedInspections,
      issues: formattedIssues,
      reporter: realName || queryUser,
      summary: storedContent.summary,
    });
  } catch (error: unknown) {
    logApiError('daily-summary', error);
    return internalServerErrorResponse(event, 'Failed to fetch daily summary');
  }
});
