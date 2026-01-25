// Knowledge Category
export interface KnowledgeCategory {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: KnowledgeCategory[];
}

export interface KnowledgeAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

// Knowledge Item
export interface KnowledgeItem {
  id: string;
  title: string;
  categoryId: string;
  categoryName?: string;
  tags: string[];
  author: string;
  publishDate: string;
  summary: string;
  content?: string; // Rich text or Markdown
  status: 'archived' | 'draft' | 'published';
  version: string;
  attachments?: KnowledgeAttachment[];
  updatedAt: string;
}

export interface KnowledgeQueryParams {
  categoryId?: string;
  keyword?: string;
  tag?: string;
  status?: string;
}
