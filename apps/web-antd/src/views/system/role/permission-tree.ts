export interface RolePermissionTreeNode {
  checkable?: boolean;
  children?: RolePermissionTreeNode[];
  key: string;
  type: string;
}

export function addRequiredPagePermissions(
  tree: RolePermissionTreeNode[],
  checkedKeys: string[],
) {
  const { nodeByKey } = collectTreeState(tree);
  const declaredKeys = checkedKeys.filter(
    (key) => nodeByKey.has(key) && !key.startsWith('MENU_'),
  );
  let normalizedKeys = declaredKeys;
  for (const key of declaredKeys) {
    normalizedKeys = reconcileRolePermissionSelection({
      changedKey: key,
      checked: true,
      checkedKeys: normalizedKeys,
      tree,
    });
  }
  return normalizedKeys;
}

function collectTreeState(nodes: RolePermissionTreeNode[]) {
  const nodeByKey = new Map<string, RolePermissionTreeNode>();
  const parentByKey = new Map<string, string>();

  const visit = (items: RolePermissionTreeNode[], parentKey?: string) => {
    for (const item of items) {
      nodeByKey.set(item.key, item);
      if (parentKey) parentByKey.set(item.key, parentKey);
      visit(item.children ?? [], item.key);
    }
  };
  visit(nodes);

  return { nodeByKey, parentByKey };
}

function collectDescendantKeys(node: RolePermissionTreeNode) {
  const keys: string[] = [];
  const visit = (nodes: RolePermissionTreeNode[]) => {
    for (const child of nodes) {
      keys.push(child.key);
      visit(child.children ?? []);
    }
  };
  visit(node.children ?? []);
  return keys;
}

export function reconcileRolePermissionSelection(input: {
  changedKey: string;
  checked: boolean;
  checkedKeys: string[];
  tree: RolePermissionTreeNode[];
}) {
  const { nodeByKey, parentByKey } = collectTreeState(input.tree);
  const selected = new Set(
    input.checkedKeys.filter((key) => !key.startsWith('MENU_')),
  );
  const changedNode = nodeByKey.get(input.changedKey);
  if (!changedNode) return [...selected];

  if (!input.checked && changedNode.type === 'menu') {
    for (const key of collectDescendantKeys(changedNode)) {
      selected.delete(key);
    }
  }

  if (input.checked) {
    let parentKey = parentByKey.get(input.changedKey);
    const visited = new Set<string>();
    while (parentKey && !visited.has(parentKey)) {
      visited.add(parentKey);
      const parent = nodeByKey.get(parentKey);
      if (!parent) break;
      if (parent.type === 'menu' && !parent.key.startsWith('MENU_')) {
        selected.add(parent.key);
      }
      parentKey = parentByKey.get(parentKey);
    }
  }

  return [...selected];
}
