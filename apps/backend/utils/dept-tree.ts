export interface DeptTreeInput {
  createdAt?: Date | string;
  description?: null | string;
  id: string;
  name: string;
  parentId?: null | string;
}

export type DeptTreeNode<T extends DeptTreeInput = DeptTreeInput> = T & {
  children: Array<DeptTreeNode<T>>;
  createTime?: string;
  remark?: string;
};

export function buildDeptTree<T extends DeptTreeInput>(
  items: T[],
): Array<DeptTreeNode<T>> {
  const result: Array<DeptTreeNode<T>> = [];
  const map = new Map<string, DeptTreeNode<T>>();

  for (const item of items) {
    map.set(item.id, {
      ...item,
      children: [],
      createTime: item.createdAt
        ? new Date(item.createdAt).toLocaleString('zh-CN')
        : '',
      remark: item.description || '',
    });
  }

  for (const item of items) {
    const node = map.get(item.id);
    if (!node) continue;
    if (item.parentId && item.parentId !== '0') {
      const parent = map.get(item.parentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    result.push(node);
  }

  return result;
}

export function flattenDeptTree<T extends DeptTreeInput>(
  nodes: Array<DeptTreeNode<T>>,
): Array<DeptTreeNode<T>> {
  const result: Array<DeptTreeNode<T>> = [];
  const walk = (items: Array<DeptTreeNode<T>>) => {
    for (const item of items) {
      result.push(item);
      if (item.children.length > 0) walk(item.children);
    }
  };
  walk(nodes);
  return result;
}

export function flattenDeptIds<T extends DeptTreeInput>(
  nodes: Array<DeptTreeNode<T>>,
): string[] {
  return flattenDeptTree(nodes).map((node) => node.id);
}

export function findDeptSubtree<T extends DeptTreeInput>(
  nodes: Array<DeptTreeNode<T>>,
  predicate: (node: DeptTreeNode<T>) => boolean,
): Array<DeptTreeNode<T>> {
  return flattenDeptTree(nodes).filter((node) => predicate(node));
}
