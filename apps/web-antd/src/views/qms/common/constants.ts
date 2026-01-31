/**
 * QMS 模块通用业务常量
 * 包含全系统统一的产品分类、缺陷类型、质量等级等定义
 */

// ==================== 产品选项 ====================
export const QMS_PRODUCT_OPTIONS = ['车辆产品', '路桥产品', '模具产品', '其他'];

export const QMS_PRODUCT_SUBTYPES: Record<string, string[]> = {
  车辆产品: ['平板车', '双头车', '抱罐车', '防爆车', '铁水挂车', '其他'],
  路桥产品: ['架桥机', '轮轨提梁机', '轮胎提梁机', '门吊', '一体机', '其他'],
  模具产品: ['风电塔筒模具', '地铁管片模具', '卧式模具', '其他'],
  其他: ['其他'],
};

// ==================== 缺陷分类 ====================
export const QMS_DEFECT_OPTIONS = [
  '设计缺陷',
  '制造装配缺陷',
  '零部件质量',
  '维护保养不当',
  '操作不当',
];

export const QMS_DEFECT_SUBTYPES: Record<string, string[]> = {
  设计缺陷: ['机械设计', '液压设计', '电气设计', '其他'],
  制造装配缺陷: [
    '焊接缺陷',
    '加工尺寸偏差',
    '漏加工',
    '制造干涉',
    '安装错位',
    '漏油渗油',
    '紧固件松动',
    '其他',
  ],
  零部件质量: ['功能失效', '元器件故障', '本身质量问题', '其他'],
  维护保养不当: [
    '油液变质',
    '紧固件松动',
    '润滑不及时',
    '未按定期点检',
    '其他',
  ],
  操作不当: ['误操作', '超载使用', '恶劣环境作业', '暴力操作', '其他'],
};

// ==================== 严重程度 ====================
export const QMS_SEVERITY_OPTIONS = ['P0 级', 'P1 级', 'P2 级', 'P3 级'];

export const QMS_SEVERITY_LEVELS = [
  {
    value: 'P0',
    label: 'P0 级',
    color: 'red',
    desc: '致命 - 严重安全性能故障，危及生命安全',
  },
  {
    value: 'P1',
    label: 'P1 级',
    color: 'orange',
    desc: '严重 - 主要功能失效，影响正常使用',
  },
  {
    value: 'P2',
    label: 'P2 级',
    color: 'blue',
    desc: '一般 - 功能部分失效，可降级使用',
  },
  {
    value: 'P3',
    label: 'P3 级',
    color: 'green',
    desc: '轻微 - 不影响使用的小问题',
  },
];

// ==================== 通用状态映射 (简版) ====================
export const QMS_STATUS_COLOR_MAP: Record<string, string> = {
  PENDING: 'orange',
  OPEN: 'red',
  IN_PROGRESS: 'blue',
  PROCESSING: 'blue',
  RESOLVED: 'green',
  CLOSED: 'gray',
  CANCELLED: 'default',
};
