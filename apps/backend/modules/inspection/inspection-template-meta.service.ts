import type { InspectionTemplateMeta } from './inspection-record-types';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import process from 'node:process';

import { parseWorkbookSheets } from '~/utils/excel-parser';
import { createModuleLogger } from '~/utils/logger';
import { UPLOAD_DIR } from '~/utils/paths';

const logger = createModuleLogger('InspectionService');

function normalizeMetaText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[:：.。_\-/]/g, '');
}

function findLabelRightValue(
  row: unknown[],
  labelIndex: number,
): null | string {
  for (let index = labelIndex + 1; index < row.length; index++) {
    const value = String(row[index] || '').trim();
    if (!value) continue;
    const normalized = normalizeMetaText(value);
    if (
      normalized.includes('表单号及版本') ||
      normalized.includes('formnorev') ||
      normalized.includes('图号') ||
      normalized.includes('drawingno') ||
      normalized.includes('产品名称') ||
      normalized.includes('project')
    ) {
      continue;
    }
    return value;
  }
  return null;
}

function resolveMetaFromSheetRows(rows: unknown[][]): InspectionTemplateMeta {
  let drawingNo: null | string = null;
  let formNo: null | string = null;

  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = String(row[index] || '').trim();
      if (!cell) continue;
      const normalized = normalizeMetaText(cell);

      if (
        !formNo &&
        (normalized.includes('表单号及版本') ||
          normalized.includes('formnorev') ||
          normalized.includes('formno&rev'))
      ) {
        formNo = findLabelRightValue(row, index);
      }

      if (
        !drawingNo &&
        (normalized.includes('图号') ||
          normalized.includes('drawingno') ||
          normalized.includes('drawing'))
      ) {
        drawingNo = findLabelRightValue(row, index);
      }

      if (formNo && drawingNo) {
        return {
          drawingNo,
          formNo,
        };
      }
    }
  }

  return {
    drawingNo,
    formNo,
  };
}

export async function resolveTemplateMetaFromAttachment(
  attachmentUrl: null | string | undefined,
): Promise<InspectionTemplateMeta> {
  const attachment = String(attachmentUrl || '').trim();
  if (!attachment) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  const rawFileName = basename(attachment.split('?')[0] || '');
  let fileName = rawFileName;
  try {
    fileName = decodeURIComponent(rawFileName);
  } catch {
    fileName = rawFileName;
  }
  if (!fileName) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  const extension = extname(fileName).toLowerCase();
  if (!['.csv', '.xls', '.xlsx'].includes(extension)) {
    return {
      drawingNo: null,
      formNo: null,
    };
  }

  try {
    const candidatePaths = [
      join(UPLOAD_DIR, fileName),
      join(process.cwd(), 'uploads', fileName),
      join(process.cwd(), 'apps', 'backend', 'uploads', fileName),
      join(process.cwd(), '..', 'uploads', fileName),
      join(process.cwd(), '..', '..', 'uploads', fileName),
    ];
    const filePath = candidatePaths.find((item) => existsSync(item));
    if (!filePath) {
      logger.warn(
        `resolve-template-meta-from-attachment file not found: ${fileName}`,
      );
      return {
        drawingNo: null,
        formNo: null,
      };
    }

    const sheets = await parseWorkbookSheets<unknown[]>(
      await readFile(filePath),
      {
        defval: '',
        header: 1,
        raw: false,
      },
    );
    for (const { rows } of sheets) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const meta = resolveMetaFromSheetRows(rows);
      if (meta.formNo || meta.drawingNo) {
        return meta;
      }
    }
  } catch (error) {
    logger.warn(
      `resolve-template-meta-from-attachment failed: ${String(
        (error as { message?: string })?.message || error,
      )} (${String(attachmentUrl || '')})`,
    );
  }

  return {
    drawingNo: null,
    formNo: null,
  };
}
