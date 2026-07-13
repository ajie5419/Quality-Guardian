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

export const INSPECTION_ISSUE_DEFECT_OPTIONS = [
  '设计缺陷',
  '工艺缺陷',
  '制造缺陷',
  '零部件缺陷',
  '其他缺陷',
] as const;

export const INSPECTION_ISSUE_DEFECT_SUBTYPES: Record<
  (typeof INSPECTION_ISSUE_DEFECT_OPTIONS)[number],
  readonly string[]
> = {
  设计缺陷: ['干涉', '尺寸错误', '程序错误', '选型问题', '其他'],
  工艺缺陷: [
    '料单错误',
    '焊接工艺问题',
    '组对工艺问题',
    '装配工艺问题',
    '其他',
  ],
  制造缺陷: [
    '加工精度缺陷',
    '装配缺陷',
    '焊接缺陷',
    '表面处理缺陷',
    '人员操作问题',
    '设备问题',
    '外观缺陷',
    '其他',
  ],
  零部件缺陷: ['与图纸协议不符', '外观问题', '功能失效', '型号错误', '其他'],
  其他缺陷: [],
};
