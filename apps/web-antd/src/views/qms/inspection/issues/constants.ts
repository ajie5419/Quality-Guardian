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
