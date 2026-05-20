type KnowledgeAuthorContext = {
  realName?: string;
  username?: string;
};

const KNOWLEDGE_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KNOWLEDGE_ID_SUFFIX_SIZE = 6;

function createKnowledgeIdSuffix(size = KNOWLEDGE_ID_SUFFIX_SIZE) {
  let output = '';
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(Math.random() * KNOWLEDGE_ID_ALPHABET.length);
    output += KNOWLEDGE_ID_ALPHABET[randomIndex];
  }
  return output;
}

function joinKnowledgeTags(tags: unknown): string {
  if (Array.isArray(tags)) {
    return tags.join(',');
  }
  return String(tags || '');
}

function stringifyKnowledgeAttachments(attachments: unknown): string {
  if (typeof attachments === 'string') {
    return attachments;
  }
  return JSON.stringify(attachments || []);
}

export function createKnowledgeDocId() {
  return `KB-${createKnowledgeIdSuffix()}`;
}

export function buildKnowledgeCreateDataCore(
  body: Record<string, unknown>,
  targetCategoryId: string,
  author: KnowledgeAuthorContext,
) {
  return {
    attachment: stringifyKnowledgeAttachments(body.attachments),
    author: String(author.realName || author.username || 'System'),
    categoryId: targetCategoryId,
    content: String(body.content || ''),
    docId: createKnowledgeDocId(),
    publishDate: new Date(),
    status: String(body.status || 'Published'),
    summary: String(body.summary || ''),
    tags: joinKnowledgeTags(body.tags),
    title: String(body.title || '未命名案例'),
    version: String(body.version || 'V1.0'),
  };
}

export function buildKnowledgeUpdateDataCore(body: Record<string, unknown>) {
  return {
    attachment: body.attachments ? JSON.stringify(body.attachments) : undefined,
    categoryId: body.categoryId as null | string | undefined,
    content: body.content as null | string | undefined,
    status: body.status as null | string | undefined,
    summary: body.summary as null | string | undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.join(',')
      : (body.tags as null | string | undefined),
    title: body.title as null | string | undefined,
    updatedAt: new Date(),
    version: body.version as null | string | undefined,
  };
}
