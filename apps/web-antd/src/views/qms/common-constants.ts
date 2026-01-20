import { SupplierStatusEnum } from '#/api/qms/enums';

/**
 * Common Rating Colors for Suppliers/Outsourcing
 */
export const RATING_COLORS: Record<string, string> = {
  A: 'green',
  B: 'blue',
  C: 'orange',
  D: 'red',
};

/**
 * Supplier Status UI Map (Shared between Supplier and Outsourcing)
 */
export const SUPPLIER_STATUS_UI_MAP: Record<string, { status: string; textKey: string; defaultText: string }> = {
  [SupplierStatusEnum.QUALIFIED]: { 
    status: 'success', 
    textKey: 'qms.supplier.status.qualified',
    defaultText: '已准入'
  },
  [SupplierStatusEnum.OBSERVATION]: { 
    status: 'warning', 
    textKey: 'qms.supplier.status.observation',
    defaultText: '质量观察'
  },
  [SupplierStatusEnum.FROZEN]: { 
    status: 'error', 
    textKey: 'qms.supplier.status.frozen',
    defaultText: '已冻结'
  },
};
