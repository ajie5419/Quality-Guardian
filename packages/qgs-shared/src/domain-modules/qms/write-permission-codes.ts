/**
 * Permission codes for metrology (backend-enforced via authorizeWrite).
 * Values mirror the historic menu button codes in rbac_permissions.
 */
export const METROLOGY_PERMISSION_CODES = {
  BORROW_CREATE: 'QMS:Metrology:Borrow:Create',
  BORROW_RETURN: 'QMS:Metrology:Borrow:Return',
  CALIBRATION_PLAN_CREATE: 'QMS:Metrology:CalibrationPlan:Create',
  CALIBRATION_PLAN_DELETE: 'QMS:Metrology:CalibrationPlan:Delete',
  CALIBRATION_PLAN_EDIT: 'QMS:Metrology:CalibrationPlan:Edit',
  CALIBRATION_PLAN_IMPORT: 'QMS:Metrology:CalibrationPlan:Import',
  CREATE: 'QMS:Metrology:Create',
  DELETE: 'QMS:Metrology:Delete',
  EDIT: 'QMS:Metrology:Edit',
  IMPORT: 'QMS:Metrology:Import',
  LIST: 'QMS:Metrology:List',
} as const;

/**
 * Permission codes for the knowledge base (backend-enforced).
 */
export const KNOWLEDGE_PERMISSION_CODES = {
  CREATE: 'QMS:Knowledge:Create',
  DELETE: 'QMS:Knowledge:Delete',
  EDIT: 'QMS:Knowledge:Edit',
  LIST: 'QMS:Knowledge:List',
  VIEW: 'QMS:Knowledge:View',
} as const;

/**
 * Permission codes for welder qualification management (backend-enforced).
 */
export const WELDER_PERMISSION_CODES = {
  CREATE: 'QMS:Welder:Create',
  DELETE: 'QMS:Welder:Delete',
  EDIT: 'QMS:Welder:Edit',
  IMPORT: 'QMS:Welder:Import',
  LIST: 'QMS:Welder:List',
  VIEW: 'QMS:Welder:View',
} as const;
