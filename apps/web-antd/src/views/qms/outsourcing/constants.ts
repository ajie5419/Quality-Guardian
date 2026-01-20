import { SupplierStatusEnum } from '#/api/qms/enums';

/**
 * Supplier Rating Colors
 */
export const RATING_COLORS: Record<string, string> = {
  A: 'green',
  B: 'blue',
  C: 'orange',
  D: 'red',
};

/**
 * Supplier Status UI Map
 */
export const STATUS_UI_MAP: Record<string, { status: string; textKey: string; defaultText: string }> = {
  [SupplierStatusEnum.QUALIFIED]: { 
    status: 'success', 
    textKey: 'qms.outsourcing.status.qualified',
    defaultText: '已准入'
  },
  [SupplierStatusEnum.OBSERVATION]: { 
    status: 'warning', 
    textKey: 'qms.outsourcing.status.observation',
    defaultText: '质量观察'
  },
  [SupplierStatusEnum.FROZEN]: { 
    status: 'error', 
    textKey: 'qms.outsourcing.status.frozen',
    defaultText: '已冻结'
  },
};
