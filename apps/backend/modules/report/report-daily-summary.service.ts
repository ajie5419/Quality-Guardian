import {
  createIdentityAggregateItem,
  mapInspectionArchiveStatusLabel,
  parseDailySummaryContent,
} from '@qgs/shared';
import { InspectionService } from '~/modules/inspection';
import {
  resolveInspectionFormProcess,
  resolveInspectionFormProcessCandidates,
} from '~/modules/inspection/inspection-form';
import { VehicleCommissioningDailyReportStorageService } from '~/modules/vehicle-commissioning/daily-report-storage.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import { ReportQueryValidationError } from './report-query-validation-error';
import {
  formatReportDate,
  getReportDayRange,
  resolveReportQueryDate,
} from './report-utils';

type DailyInspectionRow = {
  category: string;
  id: string;
  incomingType?: null | string;
  inspectionDate?: Date;
  process?: null | {
    name?: null | string;
  };
  processName?: null | string;
  projectName?: null | string;
  workOrderNumber: string;
};

type ArchiveTaskRow = Awaited<
  ReturnType<typeof InspectionService.getDailyArchiveReportData>
>['tasks'][number];

export const ReportDailySummaryService = {
  async getDailySummaryFromQuery(input: {
    date?: string;
    realName?: string;
    user?: string;
    username: string;
  }) {
    const { date: parsedQueryDate, valid: isDateValid } =
      resolveReportQueryDate(input.date);
    if (!isDateValid) {
      throw new ReportQueryValidationError('Invalid date parameter');
    }
    const queryDate = formatReportDate(parsedQueryDate);
    const queryUser = input.user || input.username;
    const reporter = input.realName || queryUser;
    const { end: endDate, start: startDate } = getReportDayRange(
      new Date(queryDate),
    );
    const inspections = await InspectionService.getDailyReportInspections({
      end: endDate,
      realName: input.realName,
      start: startDate,
      username: queryUser,
    });
    const issues = await InspectionService.getDailyReportIssues({
      end: endDate,
      start: startDate,
      username: queryUser,
    });
    const departmentNames =
      await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: issues.map((item) => item.responsibleDepartmentId),
        configKey: 'responsibleDepartment',
      });
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
      switch (item.category) {
        case 'INCOMING': {
          proc = '进货检验';
          name = item.materialName || '';
          break;
        }
        case 'PROCESS': {
          proc = resolveCanonicalProcessName(item) || '';
          name = item.level2Component || item.level1Component || '';
          break;
        }
        case 'SHIPMENT': {
          proc = '发货检验';
          name =
            item.materialName ||
            item.level2Component ||
            item.level1Component ||
            '';
          break;
        }
        default: {
          proc = resolveCanonicalProcessName(item) || item.category || '';
          name = item.materialName || item.level1Component || '';
        }
      }
      const key = `${item.workOrderNumber}::${proc}`;
      if (!processMap.has(key)) {
        processMap.set(key, {
          partNames: new Set<string>(),
          process: proc,
          projectName: item.projectName || '',
          quantity: 0,
          results: new Set<string>(),
          workOrder: item.workOrderNumber,
        });
      }
      const group = processMap.get(key);
      if (!group) return;
      if (!group.projectName && item.projectName)
        group.projectName = item.projectName;
      if (name) group.partNames.add(name);
      group.quantity += item.quantity;
      group.results.add(item.result === 'PASS' ? '合格' : '不合格');
    });
    for (const group of processMap.values()) {
      const resultStatus = group.results.has('不合格') ? '不合格' : '合格';
      formattedInspections.push({
        partName: [...group.partNames].join('、'),
        process: group.process,
        projectName: group.projectName,
        quantity: group.quantity,
        result: resultStatus,
        seq: 0,
        workOrder: group.workOrder,
      });
    }
    formattedInspections.forEach((item, index) => {
      item.seq = index + 1;
    });
    const formattedIssues = issues.map((item, index) => {
      const created = new Date(item.createdAt);
      const isToday = created >= startDate && created <= endDate;
      const department = createIdentityAggregateItem({
        canonicalName: item.responsibleDepartmentId
          ? departmentNames.get(item.responsibleDepartmentId)
          : null,
        id: item.responsibleDepartmentId,
        rawName: item.responsibleDepartment,
        value: 0,
      });
      return {
        dept: department.name,
        description: item.description,
        isToday,
        partName: item.partName,
        projectName: item.work_orders?.projectName || item.projectName || '',
        seq: index + 1,
        solution: item.solution || '待定',
        status: item.status,
        workOrder: item.workOrderNumber,
      };
    });
    const dailyArchive = await loadDailyArchiveTasks(inspections);
    const existingReport =
      await VehicleCommissioningDailyReportStorageService.findDailyReportByDateReporter(
        {
          date: new Date(queryDate),
          reporter: queryUser,
        },
      );
    const storedContent = parseDailySummaryContent(existingReport?.summary);
    return {
      archiveStats: dailyArchive.stats,
      date: queryDate,
      documentItems: dailyArchive.items,
      engineeringTodos: dailyArchive.engineeringTodos,
      inspections: formattedInspections,
      issues: formattedIssues,
      reporter,
      summary: existingReport?.reportText || storedContent.summary,
    };
  },
};

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
    const { tasks, templates } =
      await InspectionService.getDailyArchiveReportData({
        inspectionIds,
        workOrderNumbers,
      });
    const planProcessMap = new Map<string, Set<string>>();
    for (const template of templates) {
      const workOrderNumber = String(template.workOrderNumber || '').trim();
      if (!workOrderNumber) continue;
      const stepSet = planProcessMap.get(workOrderNumber) || new Set<string>();
      const step = resolveCanonicalProcessName(template);
      if (step) stepSet.add(step);
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
        processName: resolveCanonicalProcessName(task.inspection) || '',
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
      const normalizedInspection = {
        ...inspection,
        processName: resolveCanonicalProcessName(inspection) || '',
      };
      const processName = resolveInspectionFormProcess(normalizedInspection);
      const processCandidates =
        resolveInspectionFormProcessCandidates(normalizedInspection);
      const processSet = planProcessMap.get(workOrder);
      const hasTemplate = Boolean(
        processSet &&
          processCandidates.some((candidate) => processSet.has(candidate)),
      );
      let task = inspectionId ? taskMap.get(inspectionId) : undefined;
      if (!task && processCandidates.length > 0 && workOrder) {
        for (const candidate of processCandidates) {
          const matchedList = taskFallbackMap.get(`${workOrder}::${candidate}`);
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
        if (status === 'ARCHIVED') archivedCount += 1;
        else if (now > task.dueAt) overdueCount += 1;
        workContent = String(task.workContent || '').trim();
      } else {
        requiredCount += 1;
        workContent = `${processName || '当前工序'}检验表待归档`;
      }
      if (!workContent) workContent = `${processName || '检验资料'}归档`;
      return {
        projectName: String(inspection.projectName || ''),
        seq: index + 1,
        status: mapInspectionArchiveStatusLabel(status),
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
