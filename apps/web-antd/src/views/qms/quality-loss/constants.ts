import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { LossSource, LossType } from './types';

/**
 * 损失类型选项
 */
export const LOSS_TYPE_OPTIONS = [
  { label: '报废 (Scrap)', value: LossType.SCRAP },
  { label: '返工 (Rework)', value: LossType.REWORK },
  { label: '退货 (Return)', value: LossType.RETURN },
  { label: '额外物流', value: LossType.TRANSPORT },
  { label: '其他', value: LossType.OTHER },
];

export function mapDictionaryOptionsToLossType(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return LOSS_TYPE_OPTIONS;
  }
  return options.map((item) => ({
    label: item.dictValue || item.dictKey,
    value: item.dictKey,
  }));
}

const QUALITY_LOSS_STATUS_FALLBACK_VALUES = [
  'Pending',
  'Processing',
  'Confirmed',
  'Resolved',
];
const QUALITY_LOSS_STATUS_COLOR_MAP: Record<string, string> = {
  CONFIRMED: 'green',
  PENDING: 'orange',
  PROCESSING: 'blue',
  RESOLVED: 'cyan',
};

function normalizeStatusKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function mapDictionaryOptionsToQualityLossStatus(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return QUALITY_LOSS_STATUS_FALLBACK_VALUES.map((value) => ({
      value,
      label: value,
      color:
        QUALITY_LOSS_STATUS_COLOR_MAP[normalizeStatusKey(value)] || 'default',
    }));
  }

  return options.map((item) => ({
    value: item.dictKey,
    label: item.dictValue || item.dictKey,
    color:
      QUALITY_LOSS_STATUS_COLOR_MAP[normalizeStatusKey(item.dictKey)] ||
      'default',
  }));
}

/**
 * 损失来源样式映射
 */
export const SOURCE_STYLE_MAP = {
  [LossSource.COMMISSIONING]: {
    color: 'purple',
    labelKey: 'qms.qualityLoss.source.commissioning',
  },
  [LossSource.INTERNAL]: {
    color: 'blue',
    labelKey: 'qms.qualityLoss.source.internal',
  },
  [LossSource.EXTERNAL]: {
    color: 'red',
    labelKey: 'qms.qualityLoss.source.external',
  },
  [LossSource.MANUAL]: {
    color: 'default',
    labelKey: 'qms.qualityLoss.source.manual',
  },
};
