// Knowledge Category
export interface KnowledgeCategory {
  children?: KnowledgeCategory[];
  description?: string;
  id: string;
  name: string;
  parentId?: string;
}

export interface KnowledgeAttachment {
  name: string;
  size: number;
  type: string;
  url: string;
}

// Knowledge Item
export interface KnowledgeItem {
  attachments?: KnowledgeAttachment[];
  author: string;
  categoryId: string;
  categoryName?: string;
  content?: string; // Rich text or Markdown
  id: string;
  publishDate: string;
  status: 'archived' | 'draft' | 'published';
  summary: string;
  tags: string[];
  title: string;
  updatedAt: string;
  version: string;
}

export interface KnowledgeQueryParams {
  categoryId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  tag?: string;
}
