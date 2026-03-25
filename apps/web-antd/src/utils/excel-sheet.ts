export type SheetMerge = {
  endColumn: number;
  endRow: number;
  startColumn: number;
  startRow: number;
};

export type SheetCellStyle = {
  backgroundColor?: string;
  fontColor?: string;
  fontFamily?: string;
  fontLine?: 'line-through' | 'none' | 'underline';
  fontSize?: number;
  fontStyle?: 'italic' | 'normal';
  fontWeight?: 'bold' | 'normal';
  horizontalAlignment?: 'center' | 'left' | 'normal';
  verticalAlignment?: 'bottom' | 'middle' | 'top';
  wrap?: boolean;
};

export type ParsedExcelSheetData = {
  columnWidths: number[];
  excelStyles: Array<Array<any | null>>;
  merges: SheetMerge[];
  rowHeights: number[];
  rows: string[][];
  styles: Array<Array<null | SheetCellStyle>>;
};

export type ParsedExcelWorkbookData = {
  activeSheetIndex: number;
  sheets: Array<{
    data: ParsedExcelSheetData;
    index: number;
    name: string;
  }>;
};

function columnLabelToIndex(label: string) {
  let result = 0;
  for (const char of label.toUpperCase()) {
    const code = char.codePointAt(0) || 0;
    if (code < 65 || code > 90) continue;
    result = result * 26 + (code - 64);
  }
  return Math.max(0, result - 1);
}

function parseMergeRange(range: string): null | SheetMerge {
  const text = String(range || '')
    .trim()
    .toUpperCase();
  const match = text.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  const startColumn = columnLabelToIndex(match[1] || '');
  const startRow = Math.max(0, Number(match[2] || 1) - 1);
  const endColumn = columnLabelToIndex(match[3] || '');
  const endRow = Math.max(0, Number(match[4] || 1) - 1);
  return { endColumn, endRow, startColumn, startRow };
}

function normalizeArgbToHex(argb?: string) {
  const raw = String(argb || '')
    .trim()
    .toUpperCase();
  if (!raw) return '';
  if (/^[A-F0-9]{8}$/.test(raw)) return `#${raw.slice(2)}`;
  if (/^[A-F0-9]{6}$/.test(raw)) return `#${raw}`;
  return '';
}

function normalizeHorizontalAlignment(value: string) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (text === 'left') return 'left';
  if (text === 'right') return 'normal';
  if (text === 'center' || text === 'centercontinuous') return 'center';
  return undefined;
}

function normalizeVerticalAlignment(value: string) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (text === 'top') return 'top';
  if (text === 'bottom') return 'bottom';
  if (text === 'middle' || text === 'center') return 'middle';
  return undefined;
}

function parseCellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'object') {
    const cellLike = value as {
      formula?: string;
      result?: null | number | string;
      richText?: Array<{ text?: string }>;
      text?: string;
    };
    if (Array.isArray(cellLike.richText)) {
      return cellLike.richText.map((item) => String(item.text || '')).join('');
    }
    if (cellLike.result !== undefined && cellLike.result !== null) {
      return String(cellLike.result);
    }
    if (cellLike.formula) {
      return String(cellLike.formula);
    }
    if (cellLike.text) {
      return String(cellLike.text);
    }
  }
  return String(value);
}

function pickSheetCellStyle(style: any): null | SheetCellStyle {
  if (!style || typeof style !== 'object') return null;

  const next: SheetCellStyle = {};
  const fillColor = normalizeArgbToHex(style.fill?.fgColor?.argb);
  const fontColor = normalizeArgbToHex(style.font?.color?.argb);
  const horizontalAlignment = normalizeHorizontalAlignment(
    style.alignment?.horizontal,
  );
  const verticalAlignment = normalizeVerticalAlignment(
    style.alignment?.vertical,
  );

  if (fillColor) next.backgroundColor = fillColor;
  if (fontColor) next.fontColor = fontColor;
  if (style.font?.name) next.fontFamily = String(style.font.name);
  if (typeof style.font?.size === 'number' && style.font.size > 0) {
    next.fontSize = style.font.size;
  }
  if (style.font?.bold === true) next.fontWeight = 'bold';
  if (style.font?.italic === true) next.fontStyle = 'italic';
  if (style.font?.underline) next.fontLine = 'underline';
  if (style.font?.strike === true) next.fontLine = 'line-through';
  if (horizontalAlignment) next.horizontalAlignment = horizontalAlignment;
  if (verticalAlignment) next.verticalAlignment = verticalAlignment;
  if (typeof style.alignment?.wrapText === 'boolean') {
    next.wrap = style.alignment.wrapText;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function cloneStyle<T>(input: T): T {
  try {
    return structuredClone(input);
  } catch {
    return input;
  }
}

function parseWorksheet(worksheet: any): ParsedExcelSheetData {
  const mergeTexts: string[] = Array.isArray(worksheet.model?.merges)
    ? worksheet.model?.merges || []
    : [];
  const merges = mergeTexts
    .map((mergeText) => parseMergeRange(mergeText))
    .filter(Boolean) as SheetMerge[];

  let maxMergeRow = 0;
  let maxMergeCol = 0;
  for (const merge of merges) {
    maxMergeRow = Math.max(maxMergeRow, merge.endRow);
    maxMergeCol = Math.max(maxMergeCol, merge.endColumn);
  }
  const maxRow = Math.max(
    worksheet.rowCount,
    worksheet.actualRowCount,
    maxMergeRow + 1,
    1,
  );
  const maxCol = Math.max(
    worksheet.columnCount,
    worksheet.actualColumnCount,
    maxMergeCol + 1,
    1,
  );

  const rows: string[][] = Array.from({ length: maxRow }).map(() =>
    Array.from({ length: maxCol }).map(() => ''),
  );
  const styles: Array<Array<null | SheetCellStyle>> = Array.from({
    length: maxRow,
  }).map(() => Array.from({ length: maxCol }).map(() => null));
  const excelStyles: Array<Array<any | null>> = Array.from({
    length: maxRow,
  }).map(() => Array.from({ length: maxCol }).map(() => null));

  for (let rowIndex = 1; rowIndex <= maxRow; rowIndex++) {
    for (let colIndex = 1; colIndex <= maxCol; colIndex++) {
      const cell = worksheet.getCell(rowIndex, colIndex);
      const rowCells = rows[rowIndex - 1];
      const styleRow = styles[rowIndex - 1];
      const excelStyleRow = excelStyles[rowIndex - 1];
      if (!rowCells || !styleRow || !excelStyleRow) continue;

      rowCells[colIndex - 1] = parseCellValue(cell.value).trim();
      const parsedStyle = pickSheetCellStyle(cell.style);
      if (parsedStyle) {
        styleRow[colIndex - 1] = parsedStyle;
      }
      const rawStyle = cloneStyle(cell.style);
      if (rawStyle && Object.keys(rawStyle).length > 0) {
        excelStyleRow[colIndex - 1] = rawStyle;
      }
    }
  }

  const columnWidths: number[] = Array.from({ length: maxCol }).map(
    (_, index) => {
      const width = Number(worksheet.getColumn(index + 1).width || 0);
      if (!Number.isFinite(width) || width <= 0) return 0;
      return Math.round(width * 8 + 16);
    },
  );
  const rowHeights: number[] = Array.from({ length: maxRow }).map(
    (_, index) => {
      const height = Number(worksheet.getRow(index + 1).height || 0);
      if (!Number.isFinite(height) || height <= 0) return 0;
      return Math.round((height * 96) / 72);
    },
  );

  return {
    columnWidths,
    excelStyles,
    merges,
    rowHeights,
    rows,
    styles,
  };
}

function parseWorkbookWithXLSX(
  buffer: ArrayBuffer,
  XLSX: any,
): null | ParsedExcelWorkbookData {
  try {
    const workbook = XLSX.read(buffer, { cellStyles: false, type: 'array' });
    const sheetNames: string[] = Array.isArray(workbook?.SheetNames)
      ? workbook.SheetNames
      : [];
    if (sheetNames.length === 0) return null;

    const sheets = sheetNames.map((name: string, index: number) => {
      const worksheet = workbook.Sheets?.[name] || {};
      const rows = (XLSX.utils.sheet_to_json(worksheet, {
        blankrows: false,
        defval: '',
        header: 1,
        raw: false,
      }) || []) as Array<Array<number | string>>;

      const merges = Array.isArray(worksheet['!merges'])
        ? worksheet['!merges'].map((m: any) => ({
            endColumn: Number(m?.e?.c || 0),
            endRow: Number(m?.e?.r || 0),
            startColumn: Number(m?.s?.c || 0),
            startRow: Number(m?.s?.r || 0),
          }))
        : [];

      let maxColFromRows = 0;
      for (const row of rows) {
        maxColFromRows = Math.max(
          maxColFromRows,
          Array.isArray(row) ? row.length : 0,
        );
      }
      let maxColFromMerge = 0;
      for (const merge of merges) {
        maxColFromMerge = Math.max(maxColFromMerge, merge.endColumn + 1);
      }
      const maxCol = Math.max(maxColFromRows, maxColFromMerge, 1);

      const normalizedRows = rows.map((row) =>
        Array.from({ length: maxCol }).map((_, colIndex) =>
          String(row?.[colIndex] ?? ''),
        ),
      );

      const columnWidths = Array.from({ length: maxCol }).map((_, colIndex) => {
        const col = worksheet['!cols']?.[colIndex];
        const wpx = Number(col?.wpx || 0);
        if (Number.isFinite(wpx) && wpx > 0) return Math.round(wpx);
        const wch = Number(col?.wch || 0);
        if (Number.isFinite(wch) && wch > 0) return Math.round(wch * 8 + 16);
        return 0;
      });

      const rowHeights = Array.from({
        length: Math.max(normalizedRows.length, 1),
      }).map((_, rowIndex) => {
        const row = worksheet['!rows']?.[rowIndex];
        const hpx = Number(row?.hpx || 0);
        if (Number.isFinite(hpx) && hpx > 0) return Math.round(hpx);
        const hpt = Number(row?.hpt || 0);
        if (Number.isFinite(hpt) && hpt > 0) {
          return Math.round((hpt * 96) / 72);
        }
        return 0;
      });

      const safeRows = normalizedRows.length > 0 ? normalizedRows : [['']];
      const styles = safeRows.map((row) => row.map(() => null));
      const excelStyles = safeRows.map((row) => row.map(() => null));

      return {
        data: {
          columnWidths,
          excelStyles,
          merges,
          rowHeights,
          rows: safeRows,
          styles,
        },
        index,
        name: String(name || `Sheet${index + 1}`),
      };
    });

    const activeTab = Number(workbook?.Workbook?.Views?.[0]?.activeTab ?? 0);
    const activeSheetIndex =
      Number.isFinite(activeTab) && activeTab >= 0 && activeTab < sheets.length
        ? activeTab
        : 0;

    return { activeSheetIndex, sheets };
  } catch {
    return null;
  }
}

export async function parseExcelWorkbookFromArrayBuffer(
  buffer: ArrayBuffer,
): Promise<null | ParsedExcelWorkbookData> {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    if (
      !Array.isArray(workbook.worksheets) ||
      workbook.worksheets.length === 0
    ) {
      const fallbackWorkbook = await import('xlsx').then((mod) =>
        parseWorkbookWithXLSX(buffer, mod),
      );
      return fallbackWorkbook;
    }

    const sheets = workbook.worksheets.map((worksheet: any, index: number) => ({
      data: parseWorksheet(worksheet),
      index,
      name: String(worksheet.name || `Sheet${index + 1}`),
    }));

    const activeTab = Number(workbook.views?.[0]?.activeTab ?? 0);
    const activeSheetIndex =
      Number.isFinite(activeTab) && activeTab >= 0 && activeTab < sheets.length
        ? activeTab
        : 0;

    return {
      activeSheetIndex,
      sheets,
    };
  } catch {
    const fallbackWorkbook = await import('xlsx').then((mod) =>
      parseWorkbookWithXLSX(buffer, mod),
    );
    return fallbackWorkbook;
  }
}

export async function parseExcelSheetFromArrayBuffer(
  buffer: ArrayBuffer,
): Promise<null | ParsedExcelSheetData> {
  const parsed = await parseExcelWorkbookFromArrayBuffer(buffer);
  if (!parsed || parsed.sheets.length === 0) return null;
  return (
    parsed.sheets[parsed.activeSheetIndex]?.data ||
    parsed.sheets[0]?.data ||
    null
  );
}
