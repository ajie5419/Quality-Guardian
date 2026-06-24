import type { DictionaryOptionItem } from '#/api/system/dictionary';

import {
  QUALITY_LOSS_SOURCE_STYLE_MAP,
  QUALITY_LOSS_STATUS_COLOR_MAP,
  QUALITY_LOSS_STATUS_FALLBACK_VALUES,
  QUALITY_LOSS_TYPE_OPTIONS,
} from '@qgs/shared';

import { resolveQmsStatusUi } from '../shared/utils/status-ui';

/**
 * 损失类型选项
 */
export function mapDictionaryOptionsToLossType(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return [...QUALITY_LOSS_TYPE_OPTIONS];
  }
  return options.map((item) => ({
    label: item.dictValue || item.dictKey,
    value: item.dictKey,
  }));
}

function normalizeStatusKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

const QUALITY_LOSS_STATUS_COLOR_LOOKUP: Record<string, string> =
  QUALITY_LOSS_STATUS_COLOR_MAP;

function buildQualityLossStatusOption(value: string) {
  const statusUi = resolveQmsStatusUi(value, 'quality-loss');
  return {
    value,
    label: statusUi.text,
    color:
      QUALITY_LOSS_STATUS_COLOR_LOOKUP[normalizeStatusKey(value)] ||
      statusUi.color ||
      'default',
  };
}

export function mapDictionaryOptionsToQualityLossStatus(
  options?: DictionaryOptionItem[],
) {
  if (!options || options.length === 0) {
    return QUALITY_LOSS_STATUS_FALLBACK_VALUES.map((value) =>
      buildQualityLossStatusOption(value),
    );
  }

  return options.map((item) => buildQualityLossStatusOption(item.dictKey));
}

/**
 * 损失来源样式映射
 */
export const SOURCE_STYLE_MAP = QUALITY_LOSS_SOURCE_STYLE_MAP;
