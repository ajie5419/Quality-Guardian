import { LossSource, LossType } from './types';
import { QualityLossStatusEnum } from '#/api/qms/enums';

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

/**
 * 状态选项配置
 */
export const STATUS_OPTIONS = [
  {
    value: QualityLossStatusEnum.CONFIRMED,
    label: 'qms.qualityLoss.status.confirmed',
    color: 'green',
  },
  {
    value: QualityLossStatusEnum.PENDING,
    label: 'qms.qualityLoss.status.pending',
    color: 'orange',
  },
  {
    value: QualityLossStatusEnum.PROCESSING,
    label: 'qms.qualityLoss.status.processing',
    color: 'blue',
  },
];

/**
 * 损失来源样式映射
 */
export const SOURCE_STYLE_MAP = {
  [LossSource.INTERNAL]: { color: 'blue', labelKey: 'qms.qualityLoss.source.internal' },
  [LossSource.EXTERNAL]: { color: 'red', labelKey: 'qms.qualityLoss.source.external' },
  [LossSource.MANUAL]: { color: 'default', labelKey: 'qms.qualityLoss.source.manual' },
};
