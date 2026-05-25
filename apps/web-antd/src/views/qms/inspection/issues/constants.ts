import type { ComputedRef } from 'vue';

import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import {
  INSPECTION_ISSUE_CLAIM_OPTIONS,
  INSPECTION_ISSUE_DEFAULT_VALUES,
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

  const defectOptions: ComputedRef<DefectOption[]> = computed(() => [
    { label: t('qms.inspection.issues.defects.design'), value: '设计缺陷' },
    { label: t('qms.inspection.issues.defects.process'), value: '工艺缺陷' },
    {
      label: t('qms.inspection.issues.defects.manufacturing'),
      value: '制造缺陷',
    },
    { label: t('qms.inspection.issues.defects.part'), value: '零部件缺陷' },
    { label: t('qms.inspection.issues.defects.other'), value: '其他缺陷' },
  ]);

  const defectSubtypes: ComputedRef<Record<string, DefectOption[]>> = computed(
    () => ({
      设计缺陷: [
        {
          label: t('qms.inspection.issues.defects.designSub.interference'),
          value: '干涉',
        },
        {
          label: t('qms.inspection.issues.defects.designSub.sizeError'),
          value: '尺寸错误',
        },
        {
          label: t('qms.inspection.issues.defects.designSub.programError'),
          value: '程序错误',
        },
        {
          label: t('qms.inspection.issues.defects.designSub.selection'),
          value: '选型问题',
        },
        {
          label: t('qms.inspection.issues.defects.designSub.other'),
          value: '其他',
        },
      ],
      工艺缺陷: [
        {
          label: t('qms.inspection.issues.defects.processSub.bomError'),
          value: '料单错误',
        },
        {
          label: t('qms.inspection.issues.defects.processSub.welding'),
          value: '焊接工艺问题',
        },
        {
          label: t('qms.inspection.issues.defects.processSub.assembly'),
          value: '组对工艺问题',
        },
        {
          label: t('qms.inspection.issues.defects.processSub.mounting'),
          value: '装配工艺问题',
        },
        {
          label: t('qms.inspection.issues.defects.processSub.other'),
          value: '其他',
        },
      ],
      制造缺陷: [
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.precision'),
          value: '加工精度缺陷',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.assembly'),
          value: '装配缺陷',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.welding'),
          value: '焊接缺陷',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.surface'),
          value: '表面处理缺陷',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.operation'),
          value: '人员操作问题',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.equipment'),
          value: '设备问题',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.appearance'),
          value: '外观缺陷',
        },
        {
          label: t('qms.inspection.issues.defects.manufacturingSub.other'),
          value: '其他',
        },
      ],
      零部件缺陷: [
        {
          label: t('qms.inspection.issues.defects.partSub.mismatch'),
          value: '与图纸协议不符',
        },
        {
          label: t('qms.inspection.issues.defects.partSub.appearance'),
          value: '外观问题',
        },
        {
          label: t('qms.inspection.issues.defects.partSub.failure'),
          value: '功能失效',
        },
        {
          label: t('qms.inspection.issues.defects.partSub.wrongModel'),
          value: '型号错误',
        },
        {
          label: t('qms.inspection.issues.defects.partSub.other'),
          value: '其他',
        },
      ],
      其他缺陷: [],
    }),
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
