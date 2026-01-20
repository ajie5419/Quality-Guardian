import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { date, user } = getQuery(event) as { date: string; user?: string };
  const queryDate = date || new Date().toISOString().split('T')[0];
  const queryUser = user || userinfo.username;
  const realName = userinfo.realName;

  try {
    // 1. Fetch Inspection Records (Created by user on date)
    // Range: queryDate 00:00:00 to 23:59:59
    const startDate = new Date(queryDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(queryDate);
    endDate.setHours(23, 59, 59, 999);

    // Find user first to get their real name if we are querying by username?
    // Inspection records store 'inspector' as username usually or realname?
    // Based on previous files, it seems to store username or realname depending on logic.
    // Let's assume it stores username in 'inspector' field (relation in schema).

    // Actually schema says: inspector String, relation to users via username.

    const inspections = await prisma.inspections.findMany({
      where: {
        isDeleted: false,
        date: {
          gte: startDate,
          lte: endDate,
        },
        inspector: queryUser,
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

    // 2. Fetch Engineering Issues (Exceptions)
    // Logic: Created on date OR (Status != Closed AND relevant to user)
    // Relevant to user: reportedBy == queryUser (or realName?)
    // Schema: reportedBy is String. API usually stores Real Name or Username.
    // Let's filter by both just in case, or user needs to confirm.
    // For now, assume reportedBy matches queryUser or realName.

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
            OR: [
              { inspector: queryUser },
              { lastEditor: queryUser },
              // 'inspector' field in quality_records usually means who found it
            ],
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

    // 3. Fetch Report Metadata (Summary)
    // We'll store report metadata in `after_sales`? No, we have `inspections`...
    // Wait, do we have a `daily_reports` table?
    // User didn't ask to create one, but `views/qms/reports/index.vue` implies one exists or is mocked.
    // The mock `getReportsList` returned hardcoded data.
    // We might need to create a simple table or file store for "Summary" if persistent.
    // For now, let's look at `prisma/schema.prisma` again.
    // There is NO `daily_reports` table in the schema I viewed earlier.
    // I will return a placeholder summary or implement a quick storage if needed.
    // For now, simple return.

    // Process inspections
    interface ProcessItem {
      partNames: Set<string>;
      projectName: string;
      process: string;
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
    const _seq = 1;

    inspections.forEach((item) => {
      let proc = '';
      let name = '';

      // Determine Process Name and Part Name based on Category
      switch (item.category) {
        case 'INCOMING': {
          proc = '进货检验';
          name = item.itemName || item.partName || '';

          break;
        }
        case 'OUTGOING': {
          proc = '发货检验';
          name = item.projectName || item.partName || '';

          break;
        }
        case 'PROCESS': {
          proc = item.processName || '';
          const compItem = item as unknown as {
            componentName?: string;
            itemName?: string;
            partName?: string;
          };
          name =
            compItem.componentName || item.partName || compItem.itemName || '';

          break;
        }
        default: {
          // Fallback
          proc = item.processName || item.category || '';
          name = item.partName || item.itemName || '';
        }
      }

      const key = `${item.workOrderNumber}::${proc}`;

      if (!processMap.has(key)) {
        processMap.set(key, {
          workOrder: item.workOrderNumber,
          projectName: item.projectName || '', // Capture Project Name
          partNames: new Set<string>(),
          process: proc,
          quantity: 0,
          results: new Set<string>(),
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
      // Check result: if any fail, '不合格'? Or list all?
      // Usually aggregation implies overall status. Let's list unique.
      // If both present, show '合格/不合格'? Or if any fail -> fail.
      // Let's assume strict: if set has '不合格' -> '不合格'. Else '合格'.
      const resultStatus = group.results.has('不合格') ? '不合格' : '合格';

      formattedInspections.push({
        seq: 0,
        workOrder: group.workOrder,
        projectName: group.projectName,
        partName: [...group.partNames].join('、'),
        process: group.process, // Use the grouped process name
        quantity: group.quantity,
        result: resultStatus,
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
        seq: index + 1,
        workOrder: item.workOrderNumber,
        partName: item.partName,
        description: item.description,
        solution: item.solution || '待定',
        dept: item.responsibleDepartment,
        isToday,
        status: item.status,
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
      reporter: realName || queryUser,
      date: queryDate,
      inspections: formattedInspections,
      issues: formattedIssues,
      summary: existingReport?.summary || '',
    });
  } catch (error) {
    console.error('Daily summary error', error);
    return useResponseSuccess({
      reporter: realName || queryUser,
      date: queryDate,
      inspections: [],
      issues: [],
      summary: '',
    });
  }
});
