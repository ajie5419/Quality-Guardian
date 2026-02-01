/**
 * 国际化常量定义
 * 将所有硬编码的中文字符串集中管理，方便后续国际化
 */

// 当前语言环境（后续可从请求头或配置读取）
const CURRENT_LOCALE = 'zh-CN';

// 月份名称
const MONTH_NAMES: Record<string, string[]> = {
  'zh-CN': [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ],
  'en-US': [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],
};

// 周标签
const WEEK_LABELS: Record<string, string> = {
  'zh-CN': 'W',
  'en-US': 'W',
};

// 报告类型名称
const REPORT_TYPE_NAMES: Record<string, Record<string, string>> = {
  'zh-CN': {
    weekly: '周度质量分析报告',
    monthly: '月度质量分析报告',
  },
  'en-US': {
    weekly: 'Weekly Quality Analysis Report',
    monthly: 'Monthly Quality Analysis Report',
  },
};

// 状态名称
const STATUS_NAMES: Record<string, Record<string, string>> = {
  'zh-CN': {
    OPEN: '未处理',
    IN_PROGRESS: '处理中',
    CLOSED: '已关闭',
    PENDING: '待处理',
    CONFIRMED: '已确认',
  },
  'en-US': {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    CLOSED: 'Closed',
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
  },
};

// 导出工具函数
export const i18n = {
  /**
   * 获取月份名称列表
   */
  getMonths(locale = CURRENT_LOCALE): string[] {
    return MONTH_NAMES[locale] || MONTH_NAMES['zh-CN']!;
  },

  /**
   * 获取单个月份名称（1-12）
   */
  getMonthName(month: number, locale = CURRENT_LOCALE): string {
    const months = this.getMonths(locale);
    return months[month - 1] ?? `${month}月`;
  },

  /**
   * 获取周标签前缀
   */
  getWeekPrefix(locale = CURRENT_LOCALE): string {
    return WEEK_LABELS[locale] || 'W';
  },

  /**
   * 获取报告类型名称
   */
  getReportTypeName(
    type: 'weekly' | 'monthly',
    locale = CURRENT_LOCALE,
  ): string {
    return (
      REPORT_TYPE_NAMES[locale]?.[type] || REPORT_TYPE_NAMES['zh-CN']![type]!
    );
  },

  /**
   * 获取状态名称
   */
  getStatusName(status: string, locale = CURRENT_LOCALE): string {
    return (
      STATUS_NAMES[locale]?.[status] ||
      STATUS_NAMES['zh-CN']?.[status] ||
      status
    );
  },
};

// 导出便捷常量（保持向后兼容）
export const MONTHS = i18n.getMonths();
export const MONTHS_ZH = MONTH_NAMES['zh-CN']!;
export const MONTHS_EN = MONTH_NAMES['en-US']!;
