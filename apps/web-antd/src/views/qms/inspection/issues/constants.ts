import type { ComputedRef } from 'vue';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import { ClaimStatus, DeptType, IssueStatus, Severity } from './types';

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
  PURCHASE: DeptType.PURCHASE,
  PRODUCTION: DeptType.PRODUCTION,
  OUTSOURCED: DeptType.OUTSOURCED,
} as const;

/**
 * 严重程度选项
 */
export const SEVERITY_OPTIONS = [
  { label: '轻微', value: Severity.MINOR, color: 'blue' },
  { label: '严重', value: Severity.MAJOR, color: 'orange' },
  { label: '重大', value: Severity.CRITICAL, color: 'red' },
] as const;

/**
 * 索赔选项
 */
export const CLAIM_OPTIONS = [
  { label: '是', value: ClaimStatus.YES },
  { label: '否', value: ClaimStatus.NO },
] as const;

/**
 * 默认值常量
 */
export const DEFAULT_VALUES = {
  DEFAULT_QUANTITY: 1,
  DEFAULT_STATUS: IssueStatus.OPEN,
  DEFAULT_CLAIM: ClaimStatus.NO,
  DEFAULT_SEVERITY: Severity.MINOR,
  DEFAULT_DEFECT_TYPE: '制造缺陷',
  DEFAULT_DEFECT_SUBTYPE: '加工精度缺陷',
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

/**
 * 状态 UI 映射（用于表格展示）
 */
export const ISSUE_STATUS_UI_MAP: Record<
  string,
  { color: string; label: string }
> = {
  [IssueStatus.CLOSED]: { color: 'green', label: '已关闭' },
  [IssueStatus.IN_PROGRESS]: { color: 'orange', label: '处理中' },
  [IssueStatus.OPEN]: { color: 'red', label: '待处理' },
};
