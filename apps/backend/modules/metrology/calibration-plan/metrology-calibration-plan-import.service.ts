import type { CalibrationPlanImportRow } from './metrology-calibration-plan-mapping';

import prisma from '~/utils/prisma';

import {
  buildPlannedDate,
  deriveStatus,
  mapImportRow,
} from './metrology-calibration-plan-mapping';

export const MetrologyCalibrationPlanImportService = {
  async importItems(
    year: number,
    items: unknown[],
    username?: string,
    fileName?: string,
  ) {
    const rows = Array.isArray(items) ? items : [];
    const errors: Array<{ reason: string; row: number }> = [];
    let successCount = 0;

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const mapped = mapImportRow((rawRow || {}) as CalibrationPlanImportRow);
      if (!mapped) {
        continue;
      }

      if (!mapped.instrumentCode) {
        errors.push({ row: rowNumber, reason: '编号不能为空' });
        continue;
      }
      if (mapped.error) {
        errors.push({ row: rowNumber, reason: mapped.error });
        continue;
      }
      if (mapped.months.length === 0) {
        continue;
      }

      const instrument = await prisma.measuring_instruments.findFirst({
        where: {
          instrumentCode: mapped.instrumentCode,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!instrument) {
        errors.push({ row: rowNumber, reason: '编号未在台账中找到' });
        continue;
      }

      for (const monthPlan of mapped.months) {
        const plannedDate = buildPlannedDate(
          year,
          monthPlan.month,
          monthPlan.planDay,
        );

        if (!plannedDate) {
          errors.push({
            row: rowNumber,
            reason: `${monthPlan.month}月计划日期无效`,
          });
          continue;
        }

        await prisma.metrology_calibration_plans.upsert({
          where: {
            instrumentId_planYear_planMonth: {
              instrumentId: instrument.id,
              planMonth: monthPlan.month,
              planYear: year,
            },
          },
          update: {
            actualDate: null,
            isDeleted: false,
            planDay: monthPlan.planDay,
            plannedDate,
            remark: null,
            sourceFileName: fileName || null,
            status: deriveStatus(null, plannedDate),
            updatedBy: username || null,
          },
          create: {
            actualDate: null,
            createdBy: username || null,
            instrumentId: instrument.id,
            planDay: monthPlan.planDay,
            planMonth: monthPlan.month,
            plannedDate,
            planYear: year,
            remark: null,
            sourceFileName: fileName || null,
            status: deriveStatus(null, plannedDate),
            updatedBy: username || null,
          },
        });
        successCount += 1;
      }
    }

    return {
      errorCount: errors.length,
      errors,
      failedCount: errors.length,
      successCount,
      totalCount: rows.length,
    };
  },
};
