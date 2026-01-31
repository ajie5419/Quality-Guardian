import { useRouter } from 'vue-router';

export interface KnowledgeSection {
  title: string;
  fields?: Array<{ label: string; value: null | number | string | undefined }>;
  content?: string;
}

export interface KnowledgeSettlementParams {
  title: string;
  summary: string;
  sections: KnowledgeSection[];
  tags?: (string | undefined)[];
  photos?: any;
  attachmentNamePrefix?: string;
  categoryId?: string;
  version?: string;
}

/**
 * 封装“沉淀至知识库”流程的 Hook
 */
export function useKnowledgeSettlement() {
  const router = useRouter();

  /**
   * 构建文章正文 HTML
   */
  const buildArticleHtml = (sections: KnowledgeSection[]) => {
    return sections
      .map((section) => {
        let html = `<h3>${section.title}</h3>\n`;
        if (section.fields) {
          const fieldsHtml = section.fields
            .map(
              (f) => `<p><strong>${f.label}：</strong>${f.value ?? '-'}</p>\n`,
            )
            .join('');
          html += fieldsHtml;
        }
        if (section.content) {
          html += `<p>${section.content}</p>\n`;
        }
        return `${html}\n`;
      })
      .join('');
  };

  /**
   * 处理照片转附件
   */
  const processPhotos = (photos: any, prefix = '图片') => {
    let attachments: Array<{ name: string; type: string; url: string }> = [];
    try {
      if (!photos) return attachments;

      const photoArray =
        typeof photos === 'string' ? JSON.parse(photos) : photos;

      if (Array.isArray(photoArray)) {
        attachments = photoArray.map((url: string, idx: number) => ({
          name: `${prefix}_${idx + 1}`,
          url,
          type: 'image',
        }));
      } else if (photoArray) {
        attachments = [
          { name: prefix, url: String(photoArray), type: 'image' },
        ];
      }
    } catch (error) {
      console.error('Failed to parse photos for knowledge settlement', error);
    }
    return attachments;
  };

  /**
   * 执行沉淀操作
   */
  const settle = (params: KnowledgeSettlementParams) => {
    const {
      title,
      summary,
      sections,
      tags = [],
      photos,
      attachmentNamePrefix = '附件',
      categoryId = 'CAT-DEFAULT',
      version = 'V1.0',
    } = params;

    const content = buildArticleHtml(sections);
    const attachments = processPhotos(photos, attachmentNamePrefix);

    router.push({
      path: '/qms/knowledge',
      state: {
        prefill: {
          title,
          categoryId,
          summary,
          content,
          tags: tags.filter(Boolean),
          version,
          attachments,
        },
      },
    });
  };

  return {
    settle,
    buildArticleHtml,
    processPhotos,
  };
}
