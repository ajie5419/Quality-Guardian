/**
 * 树形结构相关类型定义
 * 用于部门树、菜单树、分类树等场景
 */

/**
 * 通用树节点基础接口
 */
export interface BaseTreeNode {
  id: number | string;
  name: string;
  pid?: number | string;
  children?: BaseTreeNode[];
}

/**
 * 部门树节点
 */
export interface DeptTreeNode extends BaseTreeNode {
  id: string;
  name: string;
  pid?: string;
  status?: number;
  remark?: string;
  createTime?: string;
  children?: DeptTreeNode[];
}

/**
 * TreeSelect 组件数据格式
 */
export interface TreeSelectNode {
  value: number | string;
  title: string;
  label?: string;
  disabled?: boolean;
  selectable?: boolean;
  children?: TreeSelectNode[];
}

/**
 * 将通用树数据转换为 TreeSelect 格式
 */
export function convertToTreeSelectData<T extends BaseTreeNode>(
  data: T[],
  excludeId?: number | string,
): TreeSelectNode[] {
  return data
    .filter((item) => item.id !== excludeId)
    .map((item) => ({
      children: item.children
        ? convertToTreeSelectData(item.children, excludeId)
        : undefined,
      title: item.name,
      value: item.id,
    }));
}

/**
 * 将通用树数据转换为 TreeSelect 格式（支持自定义标题）
 */
export function convertToTreeSelectDataWithTitle<
  T extends { children?: T[]; id: number | string },
>(
  data: T[],
  titleGetter: (item: T) => string,
  excludeId?: number | string,
): TreeSelectNode[] {
  return data
    .filter((item) => item.id !== excludeId)
    .map((item) => ({
      children: item.children
        ? convertToTreeSelectDataWithTitle(
            item.children,
            titleGetter,
            excludeId,
          )
        : undefined,
      title: titleGetter(item),
      value: item.id,
    }));
}

/**
 * 在树中根据名称查找 ID
 */
export function findIdByName(
  tree: TreeSelectNode[],
  name: string,
): number | string | undefined {
  for (const node of tree) {
    if (node.title === name) return node.value;
    if (node.children) {
      const found = findIdByName(node.children, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * 在树中根据 ID 查找名称
 */
export function findNameById<T extends BaseTreeNode>(
  data: T[],
  id: number | string,
): string {
  if (!data || !id) return '';
  for (const item of data) {
    // 使用 String 转换进行强一致性比对，防止数字和字符串 ID 不匹配
    if (String(item.id) === String(id)) return item.name;
    if (item.children && item.children.length > 0) {
      const found = findNameById(item.children, id);
      if (found) return found;
    }
  }
  return '';
}
