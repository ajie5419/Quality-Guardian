import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineEventHandler, readBody } from 'h3';
import { nanoid } from 'nanoid';
import { callAi, extractJson } from '~/utils/ai';
import { UPLOAD_DIR } from '~/utils/paths';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { fileList, fileContent, prompt: userPrompt } = body;

  // 1. 内容提取
  let extractedText = fileContent || '';
  if (fileList && fileList.length > 0 && !extractedText) {
    const fileInfo = fileList[0];
    const filename = fileInfo.response?.data?.filename || fileInfo.filename;
    if (filename) {
      try {
        const filePath = join(UPLOAD_DIR, filename);
        extractedText = await readFile(filePath, 'utf8');
        extractedText = extractedText.slice(0, 10_000);
      } catch {}
    }
  }

  // 2. 核心量化 Prompt
  const systemPrompt = `你是一个工业数据解析专家，任务是将非结构化文本转化为高精度的 ITP 检验 JSON 数据。

【量化解析核心规则 - 优先级最高】
1. 必须从文本中剥离出具体的数字指标。
2. 如果看到 "X ± Y" 格式：
   - standardValue 必须填 X
   - upperTolerance 必须填 Y
   - lowerTolerance 必须填 Y
3. 如果看到 "X +A / -B" 格式：
   - standardValue 必须填 X
   - upperTolerance 必须填 A
   - lowerTolerance 必须填 B
4. 所有的数值必须是数字类型，严禁在数值字段中包含单位。
5. 必须根据数值出现自动设置 "isQuantitative": true。

【字段映射】
- processStep: 工序
- activity: 检验活动
- referenceDoc: 标准编号/依据
- acceptanceCriteria: 验收标准描述 (不要包含已经在数值字段体现的参数)
- controlPoint: H/W/R/S 
- unit: 单位 (mm, μm, kg等)

只输出纯 JSON 块，禁止任何自然语言描述。`;

  const userMessage = `输入内容：\n---\n${extractedText || userPrompt}\n---`;

  try {
    const aiResponse = await callAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0,
        max_tokens: 2500,
      },
    );

    const result = extractJson(aiResponse);

    interface ItpRawItem {
      acceptanceCriteria?: string;
      activity?: string;
      controlPoint?: string;
      frequency?: string;
      isQuantitative?: boolean;
      lowerTolerance?: number | string;
      processStep?: string;
      referenceDoc?: string;
      standardValue?: number | string;
      unit?: string;
      upperTolerance?: number | string;
      verifyingDocument?: string;
      [key: string]: unknown;
    }

    const rawItems: ItpRawItem[] =
      result.items ||
      result.data ||
      (Array.isArray(result) ? result : [result]);

    const normalizedItems = rawItems
      .filter((i) => i && typeof i === 'object')
      .map((item, index) => {
        const getVal = (keys: string[]) => {
          const itemRecord = item as Record<string, unknown>;
          for (const key of keys) {
            if (itemRecord[key] !== undefined && itemRecord[key] !== null)
              return itemRecord[key];
            const norm = key.toLowerCase().replaceAll('_', '');
            const found = Object.keys(itemRecord).find(
              (k) => k.toLowerCase().replaceAll('_', '') === norm,
            );
            if (found) return itemRecord[found];
          }
          return '';
        };

        const sv =
          Number.parseFloat(
            String(getVal(['standardValue', 'value', '标准值']) || '0'),
          ) || 0;
        const ut =
          Number.parseFloat(
            String(getVal(['upperTolerance', 'plus', '正公差']) || '0'),
          ) || 0;
        const lt =
          Number.parseFloat(
            String(getVal(['lowerTolerance', 'minus', '负公差']) || '0'),
          ) || 0;

        return {
          id: `AI-${nanoid(5).toUpperCase()}`,
          order: index + 1,
          processStep: String(
            getVal(['processStep', 'step', '工序']) || '制造工序',
          ),
          activity: String(getVal(['activity', 'task', '项目']) || '常规检查'),
          referenceDoc: String(
            getVal(['referenceDoc', 'standard', '依据']) || '技术要求',
          ),
          acceptanceCriteria: String(
            getVal(['acceptanceCriteria', 'criteria', '标准']) || '合格',
          ),
          controlPoint: String(getVal(['controlPoint', 'point']) || 'W')
            .toUpperCase()
            .slice(0, 1),
          frequency: String(getVal(['frequency', '频率']) || '100%'),
          isQuantitative: !!(sv || ut || lt),
          standardValue: sv,
          upperTolerance: ut,
          lowerTolerance: lt,
          unit: String(getVal(['unit', '单位']) || 'mm'),
          verifyingDocument: String(
            getVal(['verifyingDocument', 'record', '表单']) || '检验单',
          ),
        };
      });

    if (normalizedItems.length === 0)
      throw new Error('解析内容为空，请检查输入描述是否包含质量要求');

    return useResponseSuccess(normalizedItems);
  } catch (error: unknown) {
    console.error('[AI-Generate] Error:', error);
    const axiosError = error as { message?: string };
    return useResponseError(`AI 解析失败: ${axiosError.message}`);
  }
});
