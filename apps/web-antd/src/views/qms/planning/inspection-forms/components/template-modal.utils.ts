export type SheetMerge = {
  endColumn: number;
  endRow: number;
  startColumn: number;
  startRow: number;
};

export type TemplateField = {
  acceptanceCriteria?: string;
  checkItem?: string;
  lowerTolerance?: number | string;
  standardValue?: number | string;
  unit?: string;
  upperTolerance?: number | string;
};

function normalizeCellValue(cell: unknown): string {
  return String(cell ?? '').trim();
}

export function normalizeSheetRows(rows: unknown): string[][] {
  if (!Array.isArray(rows)) return [['']];
  const normalized = rows.map((row) =>
    Array.isArray(row) ? row.map((cell) => normalizeCellValue(cell)) : [''],
  );
  return normalized.length > 0 ? normalized : [['']];
}

export function expandRowsByMerges(
  rows: string[][],
  merges: SheetMerge[] = [],
): string[][] {
  const normalizedRows = normalizeSheetRows(rows).map((row) => [...row]);
  if (normalizedRows.length === 0) return [['']];

  let maxColumns = 0;
  for (const row of normalizedRows) {
    maxColumns = Math.max(maxColumns, row.length);
  }
  for (const merge of merges) {
    maxColumns = Math.max(maxColumns, merge.endColumn + 1);
  }
  for (const row of normalizedRows) {
    while (row.length < maxColumns) row.push('');
  }

  for (const merge of merges) {
    const baseValue = normalizedRows[merge.startRow]?.[merge.startColumn] ?? '';
    for (let r = merge.startRow; r <= merge.endRow; r++) {
      const row = normalizedRows[r];
      if (!row) continue;
      for (let c = merge.startColumn; c <= merge.endColumn; c++) {
        row[c] = normalizeCellValue(row[c] || baseValue);
      }
    }
  }

  return normalizedRows;
}

export function normalizeFields(fields: TemplateField[] = []): TemplateField[] {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((field) => ({
      acceptanceCriteria: normalizeCellValue(field?.acceptanceCriteria),
      checkItem: normalizeCellValue(field?.checkItem),
      lowerTolerance: normalizeCellValue(field?.lowerTolerance),
      standardValue: normalizeCellValue(field?.standardValue),
      unit: normalizeCellValue(field?.unit),
      upperTolerance: normalizeCellValue(field?.upperTolerance),
    }))
    .filter(
      (field) =>
        field.checkItem.length > 0 || field.acceptanceCriteria.length > 0,
    );
}

function findHeaderIndex(row: string[]) {
  const indexMap = {
    acceptanceCriteria: -1,
    checkItem: -1,
    lowerTolerance: -1,
    standardValue: -1,
    unit: -1,
    upperTolerance: -1,
  };
  row.forEach((cell, idx) => {
    const text = normalizeCellValue(cell);
    if (indexMap.checkItem === -1 && /检验项|项目|检查项/.test(text)) {
      indexMap.checkItem = idx;
    }
    if (
      indexMap.acceptanceCriteria === -1 &&
      /判定标准|验收标准|标准/.test(text)
    ) {
      indexMap.acceptanceCriteria = idx;
    }
    if (indexMap.standardValue === -1 && /标准值|目标值|名义值/.test(text)) {
      indexMap.standardValue = idx;
    }
    if (indexMap.upperTolerance === -1 && /上偏差|上限|最大值/.test(text)) {
      indexMap.upperTolerance = idx;
    }
    if (indexMap.lowerTolerance === -1 && /下偏差|下限|最小值/.test(text)) {
      indexMap.lowerTolerance = idx;
    }
    if (indexMap.unit === -1 && /单位/.test(text)) {
      indexMap.unit = idx;
    }
  });
  return indexMap;
}

export function autoBuildFormFieldsFromRows(rows: string[][]): TemplateField[] {
  const normalizedRows = normalizeSheetRows(rows);
  const headerRow = normalizedRows.find((row) =>
    row.some((cell) => /检验项|判定标准|验收标准/.test(String(cell))),
  );
  const headerIndex = headerRow ? normalizedRows.indexOf(headerRow) : -1;
  const headerMap = headerRow ? findHeaderIndex(headerRow) : null;

  const startIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
  const fields: TemplateField[] = [];
  for (let i = startIndex; i < normalizedRows.length; i++) {
    const row = normalizedRows[i] ?? [];
    const checkItem =
      headerMap && headerMap.checkItem >= 0
        ? normalizeCellValue(row[headerMap.checkItem])
        : normalizeCellValue(row[0]);
    const acceptanceCriteria =
      headerMap && headerMap.acceptanceCriteria >= 0
        ? normalizeCellValue(row[headerMap.acceptanceCriteria])
        : normalizeCellValue(row[1]);

    if (!checkItem && !acceptanceCriteria) continue;

    const field: TemplateField = {
      acceptanceCriteria,
      checkItem,
    };

    const standardValue =
      headerMap && headerMap.standardValue >= 0
        ? normalizeCellValue(row[headerMap.standardValue])
        : normalizeCellValue(row[2]);
    const upperTolerance =
      headerMap && headerMap.upperTolerance >= 0
        ? normalizeCellValue(row[headerMap.upperTolerance])
        : normalizeCellValue(row[3]);
    const lowerTolerance =
      headerMap && headerMap.lowerTolerance >= 0
        ? normalizeCellValue(row[headerMap.lowerTolerance])
        : normalizeCellValue(row[4]);
    const unit =
      headerMap && headerMap.unit >= 0
        ? normalizeCellValue(row[headerMap.unit])
        : normalizeCellValue(row[5]);

    if (standardValue) field.standardValue = standardValue;
    if (upperTolerance) field.upperTolerance = upperTolerance;
    if (lowerTolerance) field.lowerTolerance = lowerTolerance;
    if (unit) field.unit = unit;

    fields.push(field);
  }

  return normalizeFields(fields);
}

export function createDefaultSheetRows(): string[][] {
  return [
    ['检验项', '判定标准', '标准值', '上偏差', '下偏差', '单位'],
    ['', '', '', '', '', ''],
  ];
}

export function buildStandardizedSheetRows(
  fields: TemplateField[],
): string[][] {
  const normalized = normalizeFields(fields);
  return [
    ['检验项', '判定标准', '标准值', '上偏差', '下偏差', '单位'],
    ...normalized.map((field) => [
      String(field.checkItem ?? ''),
      String(field.acceptanceCriteria ?? ''),
      String(field.standardValue ?? ''),
      String(field.upperTolerance ?? ''),
      String(field.lowerTolerance ?? ''),
      String(field.unit ?? ''),
    ]),
  ];
}

export function inferFileNameFromAttachmentUrl(url: string): string {
  const text = String(url || '').trim();
  if (!text) return '';
  const noQuery = text.split('?')[0] ?? text;
  const parts = noQuery.split('/');
  const rawName = parts[parts.length - 1] || '';
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

export function isExcelLikeFile(fileName: string): boolean {
  const text = String(fileName || '')
    .trim()
    .toLowerCase();
  return (
    text.endsWith('.xlsx') || text.endsWith('.xls') || text.endsWith('.csv')
  );
}
