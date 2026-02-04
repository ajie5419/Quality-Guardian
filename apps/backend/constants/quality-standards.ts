/**
 * 质量管理标准配置
 * 定义各工序/环节的默认缺陷率指标，用于计算目标合格率
 */

// 工序默认缺陷率指标 (单位: %)
export const PROCESS_DEFECT_TARGETS: Record<string, number> = {
  // 原材料/外购
  设计: 0.1, // 新增：设计工序指标
  原材料: 0.2,
  辅材: 0.1,
  外购件: 0.2,
  机加件: 0.1, // 外购的机加件？需确认上下文，此处按列表录入

  // 内部加工
  下料: 0.1,
  组对: 0.15,
  焊接: 0.15,
  机加: 0.1, // 内部机加
  涂装: 0.15,

  // 装配
  组装: 0.15,
  装配: 0.15,

  // 其他
  外协: 0.15,
};

/**
 * 默认兜底缺陷率 (当找不到对应工序时的通用标准)
 * 默认: 0.15% (即合格率 99.85%)
 */
export const DEFAULT_DEFECT_TARGET = 0.15;

/**
 * 获取指定工序的目标合格率
 * 公式: 100 - 缺陷率指标
 *
 * @param processName 工序名称 (如: "涂装")
 * @returns 目标合格率 (如: 99.85)
 *
 * @example
 * getTargetPassRate('涂装') // Returns 99.85
 * getTargetPassRate('未知工序') // Returns 99.85 (Default)
 */
export const getTargetPassRate = (processName?: string): number => {
  // 如果没有提供工序名称，返回默认目标
  if (!processName) {
    return Number((100 - DEFAULT_DEFECT_TARGET).toFixed(2));
  }

  // 查找对应指标，如果未定义则使用默认值
  const defectRate =
    PROCESS_DEFECT_TARGETS[processName] ?? DEFAULT_DEFECT_TARGET;

  // 计算合格率并处理精度
  return Number((100 - defectRate).toFixed(2));
};
