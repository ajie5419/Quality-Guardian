export const INSPECTION_ISSUE_PERMISSION_CODES = {
  CREATE: 'QMS:Inspection:Issues:Create',
  DELETE: 'QMS:Inspection:Issues:Delete',
  EDIT: 'QMS:Inspection:Issues:Edit',
  LIST: 'QMS:Inspection:Issues:List',
  VIEW: 'QMS:Inspection:Issues:View',
} as const;

export const INSPECTION_ISSUE_FIELD_LIMITS = {
  DESCRIPTION: 5000,
  NC_NUMBER: 64,
  PHOTOS: 8,
  SHORT_TEXT: 255,
} as const;
