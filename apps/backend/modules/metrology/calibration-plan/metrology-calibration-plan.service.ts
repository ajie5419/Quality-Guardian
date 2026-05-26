import type {
  CalibrationPlanListParams,
  CalibrationPlanMutationPayload,
  CalibrationPlanOverviewParams,
} from './metrology-calibration-plan-mapping';

import prisma from '~/utils/prisma';

import { MetrologyCalibrationPlanImportService } from './metrology-calibration-plan-import.service';
import {
  buildPlannedDate,
  deriveStatus,
  getValidatedPlanParts,
  normalizeMutationPayload,
} from './metrology-calibration-plan-mapping';
import { MetrologyCalibrationPlanQueryService } from './metrology-calibration-plan-query.service';

export const MetrologyCalibrationPlanService = {
  async create(body: CalibrationPlanMutationPayload, username?: string) {
    const data = this.buildMutationPayload(body);
    return prisma.metrology_calibration_plans.create({
      data: {
        ...data,
        createdBy: username || null,
        updatedBy: username || null,
      },
    });
  },

  async deleteById(id: string, username?: string) {
    return prisma.metrology_calibration_plans.update({
      where: { id },
      data: { isDeleted: true, updatedBy: username || null },
    });
  },

  async getList(params: CalibrationPlanListParams) {
    return MetrologyCalibrationPlanQueryService.getList(params);
  },

  async getAnnualGrid(
    params: Omit<CalibrationPlanListParams, 'page' | 'pageSize'>,
  ) {
    return MetrologyCalibrationPlanQueryService.getAnnualGrid(params);
  },

  async getOverview(params: CalibrationPlanOverviewParams) {
    return MetrologyCalibrationPlanQueryService.getOverview(params);
  },

  async importItems(
    year: number,
    items: unknown[],
    username?: string,
    fileName?: string,
  ) {
    return MetrologyCalibrationPlanImportService.importItems(
      year,
      items,
      username,
      fileName,
    );
  },

  async updateById(
    id: string,
    body: CalibrationPlanMutationPayload,
    username?: string,
  ) {
    const data = this.buildMutationPayload(body);
    return prisma.metrology_calibration_plans.update({
      where: { id },
      data: { ...data, updatedBy: username || null },
    });
  },

  getTemplateRows() {
    return [
      {
        序号: 1,
        设备名称: '里氏硬度计',
        编号: '52105000004',
        '型号/规格': 'TIME5300',
        1: '',
        2: '',
        3: '',
        4: '',
        5: '',
        6: '',
        7: '',
        8: 20,
        9: '',
        10: '',
        11: '',
        12: '',
      },
    ];
  },

  buildMutationPayload(body: CalibrationPlanMutationPayload) {
    const normalized = normalizeMutationPayload(body);
    if (!normalized.instrumentId) {
      throw new Error('计量器具不能为空');
    }
    if (normalized.planYear.error) {
      throw new Error(normalized.planYear.error);
    }
    if (normalized.planMonth.error) {
      throw new Error(normalized.planMonth.error);
    }
    if (normalized.planDay.error) {
      throw new Error(normalized.planDay.error);
    }
    if (normalized.actualDate.error) {
      throw new Error(normalized.actualDate.error);
    }

    const { planDay, planMonth, planYear } = getValidatedPlanParts(normalized);
    const plannedDate = buildPlannedDate(planYear, planMonth, planDay);
    if (!plannedDate) {
      throw new Error('计划日期无效');
    }

    const status = deriveStatus(normalized.actualDate.date, plannedDate);

    return {
      actualDate: normalized.actualDate.date,
      instrumentId: normalized.instrumentId,
      planDay,
      planMonth,
      planYear,
      plannedDate,
      remark: normalized.remark,
      status,
    };
  },
};
