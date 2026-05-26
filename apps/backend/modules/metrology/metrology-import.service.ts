import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/governance/master-data/master-data-governance-write';
import prisma from '~/utils/prisma';

import { deriveMetrologyInspectionStatus } from './metrology-status';

interface MetrologyImportRow {
  [key: string]: unknown;
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function pickRowValue(row: MetrologyImportRow, candidates: string[]) {
  const entries = Object.entries(row || {});
  for (const candidate of candidates) {
    const matched = entries.find(
      ([key]) => normalizeKey(key) === normalizeKey(candidate),
    );
    if (matched) {
      return matched[1];
    }
  }
  return undefined;
}

function parseOrderNo(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseExcelSerialDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const wholeDays = Math.floor(value);
  const utcDays = wholeDays - 25_569;
  const utcMillis = utcDays * 24 * 60 * 60 * 1000;
  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseStructuredDateText(text: string) {
  const normalized = text.trim().replaceAll('年', '-').replaceAll('月', '-');
  const cleaned = normalized
    .replaceAll('日', '')
    .replaceAll('.', '-')
    .replaceAll('/', '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseDateValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { date: null as Date | null, error: null as null | string };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { date: null, error: '有效期格式无效' }
      : { date: value, error: null };
  }

  if (typeof value === 'number') {
    const parsedDate = parseExcelSerialDate(value);
    return parsedDate
      ? { date: parsedDate, error: null }
      : { date: null, error: '有效期格式无效' };
  }

  const text = String(value).trim();
  if (!text) {
    return { date: null, error: null };
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsedDate = parseExcelSerialDate(Number(text));
    return parsedDate
      ? { date: parsedDate, error: null }
      : { date: null, error: '有效期格式无效' };
  }

  const parsed = parseStructuredDateText(text);
  if (!parsed) {
    return { date: null, error: '有效期格式无效' };
  }
  if (parsed.getFullYear() < 2000 || parsed.getFullYear() > 2100) {
    return { date: null, error: '有效期超出合理范围' };
  }
  return { date: parsed, error: null };
}

function mapImportRow(row: MetrologyImportRow) {
  const values = Object.values(row || {});
  const instrumentName = String(
    pickRowValue(row, ['量具名称', 'instrumentName']) ?? values[1] ?? '',
  ).trim();
  const instrumentCode = String(
    pickRowValue(row, ['编号', 'instrumentCode']) ?? values[2] ?? '',
  ).trim();
  const model = String(
    pickRowValue(row, ['型号', 'model']) ?? values[3] ?? '',
  ).trim();
  const usingUnit = String(
    pickRowValue(row, ['使用单位', 'usingUnit']) ?? values[4] ?? '',
  ).trim();
  const validUntilValue =
    pickRowValue(row, ['有效期', 'validUntil']) ?? values[5] ?? '';
  const inspectionStatusValue =
    pickRowValue(row, ['检验状态', 'inspectionStatus']) ?? values[6] ?? '';
  const orderNoValue =
    pickRowValue(row, ['序号', 'orderNo']) ?? values[0] ?? '';

  if (!instrumentName && !instrumentCode && !model && !usingUnit) {
    return null;
  }

  if (instrumentName === '量具名称' && instrumentCode === '编号') {
    return null;
  }

  const parsedDate = parseDateValue(validUntilValue);

  return {
    instrumentCode,
    instrumentName,
    inspectionStatusValue,
    model,
    orderNo: parseOrderNo(orderNoValue),
    parsedDate,
    usingUnit,
  };
}

export const MetrologyImportService = {
  async importItems(items: unknown[], username?: string, fileName?: string) {
    const rows = Array.isArray(items) ? items : [];
    const seenCodes = new Set<string>();
    const errors: Array<{ reason: string; row: number }> = [];
    let successCount = 0;

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const mapped = mapImportRow((rawRow || {}) as MetrologyImportRow);
      if (!mapped) {
        continue;
      }

      if (!mapped.instrumentName) {
        errors.push({ row: rowNumber, reason: '量具名称不能为空' });
        continue;
      }
      if (!mapped.instrumentCode) {
        errors.push({ row: rowNumber, reason: '编号不能为空' });
        continue;
      }
      if (seenCodes.has(mapped.instrumentCode)) {
        errors.push({ row: rowNumber, reason: '同一文件中编号重复' });
        continue;
      }
      seenCodes.add(mapped.instrumentCode);

      if (mapped.parsedDate.error) {
        errors.push({ row: rowNumber, reason: mapped.parsedDate.error });
        continue;
      }

      const normalizedStatus = deriveMetrologyInspectionStatus(
        undefined,
        mapped.parsedDate.date,
      );
      const governedFields = buildGovernedWriteFieldsForTable(
        'measuring_instruments',
        {
          instrumentName: mapped.instrumentName,
        },
      );
      const governedInstrumentName =
        governedFields.instrumentName || mapped.instrumentName;
      const governedCanonicalIds =
        await buildGovernedCanonicalWritePairForTable('measuring_instruments', {
          instrumentName: governedInstrumentName,
        });

      await prisma.measuring_instruments.upsert({
        where: { instrumentCode: mapped.instrumentCode },
        update: {
          isDeleted: false,
          inspectionStatus: normalizedStatus,
          instrumentName: governedInstrumentName,
          ...governedCanonicalIds,
          model: mapped.model || null,
          orderNo: mapped.orderNo,
          sourceFileName: fileName || null,
          updatedBy: username || null,
          usingUnit: mapped.usingUnit || null,
          validUntil: mapped.parsedDate.date,
        },
        create: {
          inspectionStatus: normalizedStatus,
          instrumentCode: mapped.instrumentCode,
          instrumentName: governedInstrumentName,
          ...governedCanonicalIds,
          model: mapped.model || null,
          orderNo: mapped.orderNo,
          sourceFileName: fileName || null,
          createdBy: username || null,
          updatedBy: username || null,
          usingUnit: mapped.usingUnit || null,
          validUntil: mapped.parsedDate.date,
        },
      });
      successCount += 1;
    }

    return {
      errorCount: errors.length,
      errors,
      failedCount: errors.length,
      successCount,
      totalCount: rows.length,
    };
  },
};
