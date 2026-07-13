import type { DepartmentNode } from '@/api/inspection';

import { getDepartments } from '@/api/inspection';

let cachedNames = new Map<string, string>();
let pendingRequest: null | Promise<Map<string, string>> = null;

function buildDepartmentNameMap(nodes: DepartmentNode[]) {
  const result = new Map<string, string>();
  const visit = (items: DepartmentNode[]) => {
    for (const item of items) {
      result.set(String(item.id), item.name);
      if (item.children?.length) visit(item.children);
    }
  };
  visit(nodes);
  return result;
}

export async function loadDepartmentNameMap() {
  if (cachedNames.size > 0) return cachedNames;
  if (pendingRequest) return pendingRequest;
  pendingRequest = (async () => {
    try {
      const res = await getDepartments();
      if (res.code === 0 && Array.isArray(res.data)) {
        cachedNames = buildDepartmentNameMap(res.data);
      }
      return cachedNames;
    } catch {
      return cachedNames;
    } finally {
      pendingRequest = null;
    }
  })();
  return pendingRequest;
}

export function formatDepartmentNames(
  nameMap: Map<string, string>,
  departments?: string[],
  fallback?: string,
) {
  let values = departments || [];
  if (values.length === 0 && fallback) values = [fallback];
  return values.map((value) => nameMap.get(value) || value).join('、') || '-';
}
