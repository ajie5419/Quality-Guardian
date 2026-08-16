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

/**
 * Permission codes for quality reports (backend-enforced).
 */
export const REPORTS_PERMISSION_CODES = {
  CREATE: 'QMS:Reports:Create',
  DELETE: 'QMS:Reports:Delete',
  EDIT: 'QMS:Reports:Edit',
} as const;

/**
 * Permission codes for ITP task dispatch (backend-enforced).
 */
export const TASK_DISPATCH_PERMISSION_CODES = {
  CREATE: 'QMS:TaskDispatch:Create',
  UPDATE: 'QMS:TaskDispatch:Update',
} as const;

/**
 * Permission codes for vehicle commissioning (backend-enforced).
 */
export const VEHICLE_COMMISSIONING_WRITE_CODES = {
  CREATE: 'QMS:VehicleCommissioning:Create',
  DELETE: 'QMS:VehicleCommissioning:Delete',
  EDIT: 'QMS:VehicleCommissioning:Edit',
} as const;

/**
 * Permission codes for AI-assisted generation endpoints (backend-enforced).
 */
export const AI_GENERATION_PERMISSION_CODES = {
  GENERATE: 'QMS:Ai:Generate',
} as const;

/**
 * Permission codes for dashboard target configuration (backend-enforced).
 */
export const DASHBOARD_PERMISSION_CODES = {
  CHART_EDIT: 'QMS:Dashboard:ChartEdit',
} as const;

/**
 * Permission codes for quality supervision (backend-enforced).
 */
export const SUPERVISION_PERMISSION_CODES = {
  CREATE: 'QMS:Supervision:Create',
  DELETE: 'QMS:Supervision:Delete',
  EDIT: 'QMS:Supervision:Edit',
  LIST: 'QMS:Supervision:List',
} as const;

/**
 * Permission codes for inspection requests (backend-enforced).
 */
export const INSPECTION_REQUEST_PERMISSION_CODES = {
  CLOSE: 'QMS:Inspection:Requests:Close',
  CREATE: 'QMS:Inspection:Requests:Create',
  DELETE: 'QMS:Inspection:Requests:Delete',
  DISPATCH: 'QMS:Inspection:Requests:Dispatch',
} as const;

/**
 * Permission codes for inspection material requests (backend-enforced).
 */
export const INSPECTION_MATERIAL_PERMISSION_CODES = {
  APPROVE: 'QMS:Inspection:MaterialRequests:Approve',
  LIST: 'QMS:Inspection:MaterialRequests:List',
  REJECT: 'QMS:Inspection:MaterialRequests:Reject',
} as const;
