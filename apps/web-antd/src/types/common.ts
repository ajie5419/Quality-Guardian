/**
 * 通用类型定义
 * 用于替代项目中的 any 类型，提供更精确的类型约束
 */

import type { UploadFile } from 'ant-design-vue';

// ================== 树形结构类型 ==================
/**
 * 通用树节点接口
 */
export interface TreeNode {
  id: string;
  name: string;
  pid?: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

/**
 * TreeSelect 组件所需的数据结构
 */
export interface TreeSelectData {
  value: number | string;
  title: string;
  children?: TreeSelectData[];
  disabled?: boolean;
}

// ================== 表格相关类型 ==================
/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * 通用表格行记录（带 id）
 */
export interface TableRowRecord {
  id: string;
  [key: string]: unknown;
}

/**
 * VxeTable 复选框变更参数
 */
export interface VxeCheckboxChangeParams<T = TableRowRecord> {
  $grid: {
    getCheckboxRecords: () => T[];
  };
  checked: boolean;
  row: T;
}

// ================== 表单相关类型 ==================
/**
 * 通用表单值类型
 */
export type FormValues = Record<string, unknown>;

/**
 * 上传文件信息
 */
export interface UploadChangeInfo {
  file: UploadFile;
  fileList: UploadFile[];
  event?: ProgressEvent;
}

/**
 * 上传文件（带响应）
 */
export interface UploadFileWithResponse extends UploadFile {
  response?: {
    code?: number;
    data?: {
      url?: string;
    };
  };
}

// ================== 事件处理类型 ==================
/**
 * Select 组件选项类型
 */
export interface SelectOption {
  value: number | string;
  label: string;
  disabled?: boolean;
  [key: string]: unknown;
}

/**
 * Select 变更事件的 label 参数
 */
export interface SelectLabelInfo {
  label?: string;
  value?: number | string;
}

/**
 * 输入事件类型
 */
export type InputChangeEvent = Event & {
  target: HTMLInputElement;
};

// ================== ECharts 相关类型 ==================
/**
 * ECharts 点击事件参数
 * 注意：这是简化版本，用于组件内部使用
 * 实际 ECharts 事件使用 ECElementEvent 类型
 */
export interface EChartsClickParams {
  componentType: string;
  seriesType?: string;
  seriesIndex?: number;
  seriesName?: string;
  name: string;
  dataIndex: number;
  data: unknown;
  value: number | number[];
  color?: string;
}

/**
 * ECharts 颜色回调参数
 */
export interface EChartsColorParams {
  dataIndex: number;
  data: unknown;
  seriesIndex?: number;
  value?: unknown;
}

/**
 * ECharts 实例引用类型
 */
export interface EChartsInstance {
  setOption: (option: unknown) => void;
  resize: () => void;
  on: (
    eventName: string,
    handler: (params: EChartsClickParams) => void,
  ) => void;
  off: (
    eventName: string,
    handler?: (params: EChartsClickParams) => void,
  ) => void;
  dispose: () => void;
}

// ================== API 响应类型 ==================
/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

/**
 * 通用 API 错误
 */
export interface ApiError {
  message: string;
  code?: number | string;
  details?: unknown;
}

// ================== 工具类型 ==================
/**
 * 使对象的所有属性可选且可为 null
 */
export type PartialNullable<T> = {
  [P in keyof T]?: null | T[P];
};

/**
 * 提取数组元素类型
 */
export type ArrayElement<T> = T extends readonly (infer E)[] ? E : never;

/**
 * 安全的 unknown 类型替代 any
 * 用于确实无法确定类型的临时场景
 */
export type SafeAny = unknown;
