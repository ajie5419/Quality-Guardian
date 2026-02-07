/**
 * Centralized permission codes for the system
 */
export const PERMISSION_CODES = {
  QMS: {
    LOSS_ANALYSIS: {
      EXPORT: 'QMS:LossAnalysis:Export',
      EDIT: 'QMS:LossAnalysis:Edit',
      DELETE: 'QMS:LossAnalysis:Delete',
    },
    AFTER_SALES: {
      EXPORT: 'QMS:AfterSales:Export',
      EDIT: 'QMS:AfterSales:Edit',
      DELETE: 'QMS:AfterSales:Delete',
    },
    INSPECTION: {
      EXPORT: 'QMS:Inspection:Export',
      EDIT: 'QMS:Inspection:Edit',
      DELETE: 'QMS:Inspection:Delete',
      LIST: 'QMS:Inspection:List',
      CREATE: 'QMS:Inspection:Create',
    },
    WORK_ORDER: {
      LIST: 'QMS:WorkOrder:List',
      CREATE: 'QMS:WorkOrder:Create',
      EDIT: 'QMS:WorkOrder:Edit',
      DELETE: 'QMS:WorkOrder:Delete',
      EXPORT: 'QMS:WorkOrder:Export',
      IMPORT: 'QMS:WorkOrder:Import',
    },
    PLANNING: {
      BOM: {
        LIST: 'QMS:Planning:BOM:List',
        CREATE: 'QMS:Planning:BOM:Create',
        EDIT: 'QMS:Planning:BOM:Edit',
        DELETE: 'QMS:Planning:BOM:Delete',
        EXPORT: 'QMS:Planning:BOM:Export',
        IMPORT: 'QMS:Planning:BOM:Import',
      },
      DFMEA: {
        LIST: 'QMS:Planning:DFMEA:List',
        CREATE: 'QMS:Planning:DFMEA:Create',
        EDIT: 'QMS:Planning:DFMEA:Edit',
        DELETE: 'QMS:Planning:DFMEA:Delete',
        EXPORT: 'QMS:Planning:DFMEA:Export',
      },
      ITP: {
        LIST: 'QMS:Planning:ITP:List',
        CREATE: 'QMS:Planning:ITP:Create',
        EDIT: 'QMS:Planning:ITP:Edit',
        DELETE: 'QMS:Planning:ITP:Delete',
        EXPORT: 'QMS:Planning:ITP:Export',
      },
    },
    SUPPLIER: {
      LIST: 'QMS:Supplier:List',
      CREATE: 'QMS:Supplier:Create',
      EDIT: 'QMS:Supplier:Edit',
      DELETE: 'QMS:Supplier:Delete',
      EXPORT: 'QMS:Supplier:Export',
      IMPORT: 'QMS:Supplier:Import',
    },
  },
} as const;

export type PermissionCode = string;
