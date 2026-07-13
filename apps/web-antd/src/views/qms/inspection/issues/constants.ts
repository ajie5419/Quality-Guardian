import type { ComputedRef } from 'vue';

import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import {
  INSPECTION_ISSUE_CLAIM_OPTIONS,
  INSPECTION_ISSUE_DEFAULT_VALUES,
  INSPECTION_ISSUE_DEFECT_OPTIONS,
  INSPECTION_ISSUE_DEFECT_SUBTYPES,
  INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS,
  INSPECTION_ISSUE_SEVERITY_OPTIONS,
  INSPECTION_ISSUE_STATUS_UI_MAP,
} from '@qgs/shared';

import { ClaimStatus, IssueStatus, Severity } from './types';

/**
 * NC 编号相关常量
 */
export const NC_NUMBER_PREFIX = 'NC';
export const NC_NUMBER_SUFFIX = 'KJ';
export const NC_NUMBER_SEQUENCE_LENGTH = 3;

/**
 * 部门类型相关常量
 */
export const DEPT_TYPE_KEYWORDS = {
  ...INSPECTION_ISSUE_DEPT_TYPE_KEYWORDS,
} as const;

/**
 * 严重程度选项
 */
export const SEVERITY_OPTIONS = [...INSPECTION_ISSUE_SEVERITY_OPTIONS] as const;

/**
 * 索赔选项
 */
export const CLAIM_OPTIONS = [...INSPECTION_ISSUE_CLAIM_OPTIONS] as const;

/**
 * 默认值常量
 */
export const DEFAULT_VALUES = {
  ...INSPECTION_ISSUE_DEFAULT_VALUES,
} as const;

/**
 * UI 常量
 */
export const UI_CONSTANTS = {
  MAX_UPLOAD_IMAGES: 8,
  SUPPLIER_PAGE_SIZE: 2000,
  MIN_CHART_COL_SPAN: 3,
  MAX_CHART_COL_SPAN: 12,
  DEFAULT_CHART_COL_SPAN: 4,
  CHART_GRID_COLUMNS: 12,
} as const;

export interface DefectOption {
  label: string;
  value: string;
}

export interface StatusOption {
  color: string;
  label: string;
  value: string;
}

const DEFECT_LABEL_KEYS: Record<string, string> = {
  设计缺陷: 'qms.inspection.issues.defects.design',
  工艺缺陷: 'qms.inspection.issues.defects.process',
  制造缺陷: 'qms.inspection.issues.defects.manufacturing',
  零部件缺陷: 'qms.inspection.issues.defects.part',
  其他缺陷: 'qms.inspection.issues.defects.other',
};

const DEFECT_SUBTYPE_LABEL_KEYS: Record<string, Record<string, string>> = {
  设计缺陷: {
    干涉: 'qms.inspection.issues.defects.designSub.interference',
    尺寸错误: 'qms.inspection.issues.defects.designSub.sizeError',
    程序错误: 'qms.inspection.issues.defects.designSub.programError',
    选型问题: 'qms.inspection.issues.defects.designSub.selection',
    其他: 'qms.inspection.issues.defects.designSub.other',
  },
  工艺缺陷: {
    料单错误: 'qms.inspection.issues.defects.processSub.bomError',
    焊接工艺问题: 'qms.inspection.issues.defects.processSub.welding',
    组对工艺问题: 'qms.inspection.issues.defects.processSub.assembly',
    装配工艺问题: 'qms.inspection.issues.defects.processSub.mounting',
    其他: 'qms.inspection.issues.defects.processSub.other',
  },
  制造缺陷: {
    加工精度缺陷: 'qms.inspection.issues.defects.manufacturingSub.precision',
    装配缺陷: 'qms.inspection.issues.defects.manufacturingSub.assembly',
    焊接缺陷: 'qms.inspection.issues.defects.manufacturingSub.welding',
    表面处理缺陷: 'qms.inspection.issues.defects.manufacturingSub.surface',
    人员操作问题: 'qms.inspection.issues.defects.manufacturingSub.operation',
    设备问题: 'qms.inspection.issues.defects.manufacturingSub.equipment',
    外观缺陷: 'qms.inspection.issues.defects.manufacturingSub.appearance',
    其他: 'qms.inspection.issues.defects.manufacturingSub.other',
  },
  零部件缺陷: {
    与图纸协议不符: 'qms.inspection.issues.defects.partSub.mismatch',
    外观问题: 'qms.inspection.issues.defects.partSub.appearance',
    功能失效: 'qms.inspection.issues.defects.partSub.failure',
    型号错误: 'qms.inspection.issues.defects.partSub.wrongModel',
    其他: 'qms.inspection.issues.defects.partSub.other',
  },
  其他缺陷: {},
};

function normalizeStatusKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

/**
 * 缺陷类型选项
 */
export function useDefectOptions() {
  const { t } = useI18n();

  const defectOptions: ComputedRef<DefectOption[]> = computed(() =>
    INSPECTION_ISSUE_DEFECT_OPTIONS.map((value) => ({
      label: t(DEFECT_LABEL_KEYS[value] || value),
      value,
    })),
  );

  const defectSubtypes: ComputedRef<Record<string, DefectOption[]>> = computed(
    () =>
      Object.fromEntries(
        INSPECTION_ISSUE_DEFECT_OPTIONS.map((defectType) => [
          defectType,
          INSPECTION_ISSUE_DEFECT_SUBTYPES[defectType].map((value) => ({
            label: t(DEFECT_SUBTYPE_LABEL_KEYS[defectType]?.[value] || value),
            value,
          })),
        ]),
      ),
  );

  return { defectOptions, defectSubtypes };
}

/**
 * 严重程度选项
 */
export function useSeverityOptions() {
  const { t } = useI18n();

  const severityOptions = computed(() => [
    {
      label: t('qms.inspection.issues.severityLevel.minor'),
      value: Severity.MINOR,
      color: 'blue',
    },
    {
      label: t('qms.inspection.issues.severityLevel.major'),
      value: Severity.MAJOR,
      color: 'orange',
    },
    {
      label: t('qms.inspection.issues.severityLevel.critical'),
      value: Severity.CRITICAL,
      color: 'red',
    },
  ]);

  return { severityOptions };
}

/**
 * 索赔选项
 */
export function useClaimOptions() {
  const { t } = useI18n();

  const claimOptions = computed(() => [
    { label: t('common.yes'), value: ClaimStatus.YES },
    { label: t('common.no'), value: ClaimStatus.NO },
  ]);

  return { claimOptions };
}

/**
 * 状态选项
 */
export function useStatusOptions() {
  const { t } = useI18n();

  const statusOptions: ComputedRef<StatusOption[]> = computed(() => [
    {
      value: IssueStatus.OPEN,
      label: t('qms.inspection.issues.status.open'),
      color: 'red',
    },
    {
      value: IssueStatus.IN_PROGRESS,
      label: t('qms.inspection.issues.status.inProgress'),
      color: 'orange',
    },
    {
      value: IssueStatus.CLOSED,
      label: t('qms.inspection.issues.status.closed'),
      color: 'green',
    },
  ]);

  return { statusOptions };
}

export function mapDictionaryOptionsToIssueStatus(
  options: DictionaryOptionItem[] | undefined,
  fallbackOptions: StatusOption[] = [],
): StatusOption[] {
  if (!options || options.length === 0) {
    return fallbackOptions;
  }
  const colorMap: Record<string, string> = {};
  for (const item of fallbackOptions) {
    colorMap[normalizeStatusKey(item.value)] = item.color;
  }
  return options.map((item) => {
    const key = normalizeStatusKey(item.dictKey);
    return {
      value: item.dictKey,
      label: item.dictValue || item.dictKey,
      color: colorMap[key] || 'default',
    };
  });
}

/**
 * 状态 UI 映射（用于表格展示）
 */
export const ISSUE_STATUS_UI_MAP: Record<
  string,
  { color: string; label: string }
> = {
  ...INSPECTION_ISSUE_STATUS_UI_MAP,
};
