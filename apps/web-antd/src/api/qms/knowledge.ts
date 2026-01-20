import { requestClient } from '#/api/request';

export namespace QmsKnowledgeApi {
  // 知识分类
  export interface Category {
    id: string;
    name: string;
    description?: string;
    parentId?: string;
    children?: Category[];
  }

  // 知识条目
  export interface KnowledgeItem {
    id: string;
    title: string;
    categoryId: string;
    categoryName?: string;
    tags: string[];
    author: string;
    publishDate: string;
    summary: string;
    content?: string; // 富文本或Markdown
    status: 'archived' | 'draft' | 'published';
    version: string;
    attachments?: Attachment[];
    updatedAt: string;
  }

  export interface Attachment {
    name: string;
    url: string;
    size: number;
    type: string;
  }

  export interface QueryParams {
    categoryId?: string;
    keyword?: string;
    tag?: string;
    status?: string;
  }
}

/**
 * 获取分类树
 */
export async function getCategoryTree() {
  return requestClient.get<QmsKnowledgeApi.Category[]>(
    '/qms/knowledge/categories',
  );
}

/**
 * 创建分类
 */
export async function createCategory(data: Partial<QmsKnowledgeApi.Category>) {
  return requestClient.post<QmsKnowledgeApi.Category>(
    '/qms/knowledge/categories',
    data,
  );
}

/**
 * 更新分类
 */
export async function updateCategory(
  id: string,
  data: Partial<QmsKnowledgeApi.Category>,
) {
  return requestClient.put<QmsKnowledgeApi.Category>(
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
export async function getKnowledgeList(params?: QmsKnowledgeApi.QueryParams) {
  return requestClient.get<QmsKnowledgeApi.KnowledgeItem[]>('/qms/knowledge', {
    params,
  });
}

/**
 * 获取知识详情
 */
export async function getKnowledgeDetail(id: string) {
  return requestClient.get<QmsKnowledgeApi.KnowledgeItem>(
    `/qms/knowledge/${id}`,
  );
}

/**
 * 创建知识条目
 */
export async function createKnowledge(
  data: Partial<QmsKnowledgeApi.KnowledgeItem>,
) {
  return requestClient.post<QmsKnowledgeApi.KnowledgeItem>(
    '/qms/knowledge',
    data,
  );
}

/**
 * 更新知识条目
 */
export async function updateKnowledge(
  id: string,
  data: Partial<QmsKnowledgeApi.KnowledgeItem>,
) {
  return requestClient.put<QmsKnowledgeApi.KnowledgeItem>(
    `/qms/knowledge/${id}`,
    data,
  );
}

/**
 * 删除知识条目
 */
export async function deleteKnowledge(id: string) {
  return requestClient.delete(`/qms/knowledge/${id}`);
}
