import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { formatReportDate, resolveReportQueryDate } from '~/utils/report';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { date, user } = getQuery(event) as { date: string; user?: string };
  const { date: parsedQueryDate, valid: isDateValid } =
    resolveReportQueryDate(date);
  if (!isDateValid) {
    setResponseStatus(event, 400);
    return useResponseError('Invalid date parameter');
  }
  const queryDate = formatReportDate(parsedQueryDate);
  const queryUser = user || userinfo.username;
  const realName = userinfo.realName;

  try {
    // 1. Fetch Inspection Records (Created by user on date)
    // Range: queryDate 00:00:00 to 23:59:59
    const startDate = new Date(queryDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(queryDate);
    endDate.setHours(23, 59, 59, 999);

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
        seq: index + 1,
        solution: item.solution || '待定',
        status: item.status,
        workOrder: item.workOrderNumber,
      };
    });

    // Try to find an existing summary in daily_reports
    const existingReport = await prisma.daily_reports.findUnique({
      where: {
        date_reporter: {
          date: new Date(queryDate),
          reporter: queryUser,
        },
      },
    });

    return useResponseSuccess({
      date: queryDate,
      inspections: formattedInspections,
      issues: formattedIssues,
      reporter: realName || queryUser,
      summary: existingReport?.summary || '',
    });
  } catch (error: unknown) {
    logApiError('daily-summary', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch daily summary');
  }
});
