import { useRouter } from 'vue-router';

import { message } from 'ant-design-vue';

import { extractAiTags } from '#/api/qms/ai-planning';

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
  const settle = async (params: KnowledgeSettlementParams) => {
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
    const photoList = processPhotos(photos, attachmentNamePrefix);

    let finalContent = content;
    if (photoList && photoList.length > 0) {
      finalContent += `\n<h3>相关图片</h3>\n`;
      finalContent += photoList
        .map(
          (p) =>
            `<img src="${p.url}" alt="${p.name}" style="max-width: 100%; margin: 10px 0;" />`,
        )
        .join('\n');
    }

    // --- AI 标签提取 ---
    const aiText = `${summary}\n${sections
      .map((s) => s.content || '')
      .filter(Boolean)
      .join('\n')}`;

    let aiTags: string[] = [];
    if (aiText.trim()) {
      const hide = message.loading('AI 智能分析标签中...', 0);
      try {
        aiTags = await extractAiTags(aiText);
      } catch (error) {
        console.error('AI Tags extraction failed', error);
      } finally {
        hide();
      }
    }

    const mergedTags = [
      ...new Set([...(tags || []).filter(Boolean), ...aiTags]),
    ];

    router.push({
      path: '/qms/knowledge',
      state: {
        prefill: {
          title,
          categoryId,
          summary,
          content: finalContent,
          tags: mergedTags,
          version,
          attachments: [], // 不再作为独立附件传递
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
