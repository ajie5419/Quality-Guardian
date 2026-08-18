/**
 * Centralized permission codes for the system
 */
export const PERMISSION_CODES = {
  QMS: {
    LOSS_ANALYSIS: {
      CREATE: 'QMS:LossAnalysis:Create',
      DELETE: 'QMS:LossAnalysis:Delete',
      EDIT: 'QMS:LossAnalysis:Edit',
      EXPORT: 'QMS:LossAnalysis:Export',
      IMPORT: 'QMS:LossAnalysis:Import',
    },
    AFTER_SALES: {
      CREATE: 'QMS:AfterSales:Create',
      DELETE: 'QMS:AfterSales:Delete',
      EDIT: 'QMS:AfterSales:Edit',
    },
    WORK_ORDER: {
      LIST: 'QMS:WorkOrder:List',
      CREATE: 'QMS:WorkOrder:Create',
      EDIT: 'QMS:WorkOrder:Edit',
      CONFIRM: 'QMS:WorkOrder:Confirm',
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
      INSPECTION_FORM: {
        LIST: 'QMS:Planning:InspectionForm:List',
        CREATE: 'QMS:Planning:InspectionForm:Create',
        EDIT: 'QMS:Planning:InspectionForm:Edit',
        DELETE: 'QMS:Planning:InspectionForm:Delete',
      },
      PROJECT_DOCS: {
        LIST: 'QMS:Planning:ProjectDocs:List',
        CREATE: 'QMS:Planning:ProjectDocs:Create',
        EDIT: 'QMS:Planning:ProjectDocs:Edit',
        DELETE: 'QMS:Planning:ProjectDocs:Delete',
        DOWNLOAD: 'QMS:Planning:ProjectDocs:Download',
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
