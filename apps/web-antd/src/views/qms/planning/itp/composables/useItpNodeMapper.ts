import type { PlanningTreeNode } from '../../types';

import type { QmsPlanningApi } from '#/api/qms/planning';

type ItpNodeLike = Partial<QmsPlanningApi.ItpTreeNode> &
  Record<string, unknown> & {
    id: string;
    name: string;
    type: 'item' | 'project';
  };

function isItpNodeLike(node: unknown): node is ItpNodeLike {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.type === 'item' || candidate.type === 'project')
  );
}

export function getNodeString(node: PlanningTreeNode | undefined, key: string) {
  if (!node) return '';
  const value = node[key];
  return typeof value === 'string' ? value : '';
}

export function toPlanningNode(node: unknown): PlanningTreeNode {
  if (!isItpNodeLike(node)) {
    return { id: '', name: '', type: 'item' };
  }
  return {
    id: node.id,
    name: node.name,
    parentId: typeof node.parentId === 'string' ? node.parentId : null,
    status: typeof node.status === 'string' ? node.status : undefined,
    type: node.type,
    version: typeof node.version === 'string' ? node.version : undefined,
    workOrderNumber:
      typeof node.workOrderNumber === 'string' ? node.workOrderNumber : '',
  };
}

export function toItpTreeNode(node: unknown): QmsPlanningApi.ItpTreeNode {
  if (isItpNodeLike(node)) return node;
  return { id: '', name: '', type: 'item' };
}

export function getCurrentProjectVersion(project: null | PlanningTreeNode) {
  return project?.version || 'v1.0';
}
