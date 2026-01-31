import type {
  KnowledgeCategory,
  KnowledgeItem,
  KnowledgeQueryParams,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export shared types
export * from '@qgs/shared';

/**
 * 获取分类树
 */
export async function getCategoryTree() {
  return requestClient.get<KnowledgeCategory[]>('/qms/knowledge/categories');
}

/**
 * 创建分类
 */
export async function createCategory(data: Partial<KnowledgeCategory>) {
  return requestClient.post<KnowledgeCategory>(
    '/qms/knowledge/categories',
    data,
  );
}

/**
 * 更新分类
 */
export async function updateCategory(
  id: string,
  data: Partial<KnowledgeCategory>,
) {
  return requestClient.put<KnowledgeCategory>(
    `/qms/knowledge/categories/${id}`,
    data,
  );
}

/**
 * 删除分类
 */
export async function deleteCategory(id: string) {
  return requestClient.delete(`/qms/knowledge/categories/${id}`);
}

/**
 * 获取知识列表
 */
export async function getKnowledgeList(params?: KnowledgeQueryParams) {
  return requestClient.get<{ items: KnowledgeItem[]; total: number }>(
    '/qms/knowledge',
    {
      params,
    },
  );
}

/**
 * 获取知识详情
 */
export async function getKnowledgeDetail(id: string) {
  return requestClient.get<KnowledgeItem>(`/qms/knowledge/${id}`);
}

/**
 * 创建知识条目
 */
export async function createKnowledge(data: Partial<KnowledgeItem>) {
  return requestClient.post<KnowledgeItem>('/qms/knowledge', data);
}

/**
 * 更新知识条目
 */
export async function updateKnowledge(
  id: string,
  data: Partial<KnowledgeItem>,
) {
  return requestClient.put<KnowledgeItem>(`/qms/knowledge/${id}`, data);
}

/**
 * 删除知识条目
 */
export async function deleteKnowledge(id: string) {
  return requestClient.delete(`/qms/knowledge/${id}`);
}

export namespace QmsKnowledgeApi {
  export type Category = import('@qgs/shared').KnowledgeCategory;
  export type QueryParams = import('@qgs/shared').KnowledgeQueryParams;
  export type Attachment = import('@qgs/shared').KnowledgeAttachment;
  export type Item = import('@qgs/shared').KnowledgeItem;
}
export namespace QmsKnowledgeApi {
  export type KnowledgeItem = import('@qgs/shared').KnowledgeItem;
}
