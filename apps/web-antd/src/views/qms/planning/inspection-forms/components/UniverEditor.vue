<script lang="ts" setup>
import type { IDisposable } from '@univerjs/presets';

import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import zhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import { createUniver, LocaleType } from '@univerjs/presets';

import '@univerjs/preset-sheets-core/lib/index.css';

type CellLike = boolean | null | number | string | undefined;

type Matrix = CellLike[][];
type SheetMerge = {
  endColumn: number;
  endRow: number;
  startColumn: number;
  startRow: number;
};
type SheetData = {
  columnWidths?: number[];
  merges: SheetMerge[];
  rowHeights?: number[];
  rows: string[][];
  styles?: Array<
    Array<null | {
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
    }>
  >;
  wrap?: boolean;
};

type UniverInitResult = ReturnType<typeof createUniver>;

type FWorkbookLike = ReturnType<
  NonNullable<UniverInitResult['univerAPI']['createWorkbook']>
>;

type CommandLike = { id?: string };

const props = withDefaults(
  defineProps<{
    emitDirty?: boolean;
    floatingPanels?: boolean;
    formulaBar?: boolean;
    height?: number;
    toolbar?: boolean;
  }>(),
  {
    emitDirty: true,
    floatingPanels: true,
    formulaBar: true,
    height: 520,
    toolbar: true,
  },
);
const emit = defineEmits<{
  dirty: [];
}>();

const containerRef = ref<HTMLElement>();

let univerResult: null | UniverInitResult = null;
let workbookCommandDisposable: IDisposable | null = null;
let currentWorkbookId = '';
let formulaWorker: null | Worker = null;
let programmaticUpdating = false;

function normalizeRows(input: Matrix | undefined): string[][] {
  const rows = Array.isArray(input) ? input : [];
  if (rows.length === 0) return [['']];

  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const normalized = rows.map((row) => {
    const values = row
      .slice(0, columnCount)
      .map((cell) => (cell === null || cell === undefined ? '' : String(cell)));
    if (values.length < columnCount) {
      values.push(
        ...Array.from({ length: columnCount - values.length }).map(() => ''),
      );
    }
    return values;
  });

  return normalized.length > 0 ? normalized : [['']];
}

function trimRows(rows: string[][]): string[][] {
  let lastRow = -1;
  let lastColumn = -1;

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (String(cell || '').trim()) {
        lastRow = Math.max(lastRow, rowIndex);
        lastColumn = Math.max(lastColumn, colIndex);
      }
    });
  });

  if (lastRow < 0 || lastColumn < 0) {
    return [['']];
  }

  return rows
    .slice(0, lastRow + 1)
    .map((row) =>
      row.slice(0, lastColumn + 1).map((cell) => String(cell || '')),
    );
}

function getActiveWorkbook(): FWorkbookLike | null {
  if (!univerResult) return null;

  const active = univerResult.univerAPI.getActiveWorkbook();
  if (active) return active as FWorkbookLike;

  if (!currentWorkbookId) return null;
  return univerResult.univerAPI.getWorkbook(
    currentWorkbookId,
  ) as FWorkbookLike | null;
}

function bindDirtyListener(workbook: FWorkbookLike) {
  workbookCommandDisposable?.dispose();
  if (!props.emitDirty) {
    workbookCommandDisposable = null;
    return;
  }
  workbookCommandDisposable = workbook.onCommandExecuted(
    (command: CommandLike) => {
      if (programmaticUpdating) return;
      const commandId = String(command?.id || '');
      if (
        commandId.startsWith('sheet.command') ||
        commandId.startsWith('sheet.mutation')
      ) {
        emit('dirty');
      }
    },
  );
}

function createWorkbookWithRows(rows: string[][]) {
  if (!univerResult) return;

  const workbookData = {
    id: `inspection-template-${Date.now()}`,
    name: '检验表',
  };

  const previousWorkbookId = currentWorkbookId;
  const workbook = univerResult.univerAPI.createWorkbook(workbookData, {
    makeCurrent: true,
  }) as FWorkbookLike;

  currentWorkbookId = workbook.getId();
  bindDirtyListener(workbook);

  const sheet = workbook.getActiveSheet();
  const rowCount = rows.length;
  const colCount = Math.max(...rows.map((row) => row.length), 1);

  if (rowCount > 0 && colCount > 0) {
    sheet.getRange(0, 0, rowCount, colCount).setValues(rows);
  }

  if (previousWorkbookId && previousWorkbookId !== currentWorkbookId) {
    univerResult.univerAPI.disposeUnit(previousWorkbookId);
  }
}

function inferColumnWidths(rows: string[][]) {
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  return Array.from({ length: maxColumns }).map((_, columnIndex) => {
    let maxVisualLength = 0;
    for (const row of rows) {
      const text = String(row[columnIndex] || '');
      // Chinese/full-width chars take more space than ASCII in sheet rendering.
      let visualLength = 0;
      for (const char of text) {
        const codePoint = char.codePointAt(0) || 0;
        visualLength += codePoint > 255 ? 2 : 1;
      }
      maxVisualLength = Math.max(maxVisualLength, visualLength);
    }
    return Math.min(420, Math.max(90, 24 + maxVisualLength * 8));
  });
}

function applySheetLayout(sheetData: {
  columnWidths?: number[];
  rowHeights?: number[];
  rows: string[][];
  wrap: boolean;
}) {
  const workbook = getActiveWorkbook();
  if (!workbook) return;

  const sheet = workbook.getActiveSheet();
  const rowCount = sheetData.rows.length;
  const colCount = Math.max(...sheetData.rows.map((row) => row.length), 1);
  if (rowCount <= 0 || colCount <= 0) return;

  const columnWidths =
    Array.isArray(sheetData.columnWidths) && sheetData.columnWidths.length > 0
      ? sheetData.columnWidths
      : inferColumnWidths(sheetData.rows);

  columnWidths.forEach((width, columnIndex) => {
    if (!Number.isFinite(width) || width <= 0) return;
    sheet.setColumnWidth(columnIndex, Math.round(width));
  });

  if (Array.isArray(sheetData.rowHeights) && sheetData.rowHeights.length > 0) {
    sheetData.rowHeights.forEach((height, rowIndex) => {
      if (!Number.isFinite(height) || height <= 0) return;
      sheet.setRowHeight(rowIndex, Math.round(height));
    });
  }

  if (sheetData.wrap) {
    sheet.getRange(0, 0, rowCount, colCount).setWrap(true);
  }
}

function applyMerges(merges: SheetMerge[]) {
  const workbook = getActiveWorkbook();
  if (!workbook) return;

  const sheet = workbook.getActiveSheet();
  for (const merge of merges) {
    const rowCount = merge.endRow - merge.startRow + 1;
    const colCount = merge.endColumn - merge.startColumn + 1;
    if (rowCount <= 1 && colCount <= 1) continue;
    sheet
      .getRange(merge.startRow, merge.startColumn, rowCount, colCount)
      .merge({ isForceMerge: true });
  }
}

function applyCellStyles(
  rows: string[][],
  styles: SheetData['styles'],
  wrapFallback: boolean,
) {
  const workbook = getActiveWorkbook();
  if (!workbook) return;

  const sheet = workbook.getActiveSheet();
  const rowCount = rows.length;
  const colCount = Math.max(...rows.map((row) => row.length), 1);
  const hasStyleMatrix = Array.isArray(styles) && styles.length > 0;

  if (hasStyleMatrix) {
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const styleRow = styles?.[rowIndex];
      if (!Array.isArray(styleRow)) continue;
      for (let colIndex = 0; colIndex < colCount; colIndex++) {
        const cellStyle = styleRow[colIndex];
        if (!cellStyle) continue;

        const range = sheet.getRange(rowIndex, colIndex, 1, 1);
        if (cellStyle.backgroundColor) {
          range.setBackground(cellStyle.backgroundColor);
        }
        if (cellStyle.fontColor) {
          range.setFontColor(cellStyle.fontColor);
        }
        if (cellStyle.fontFamily) {
          range.setFontFamily(cellStyle.fontFamily);
        }
        if (cellStyle.fontSize) {
          range.setFontSize(cellStyle.fontSize);
        }
        if (cellStyle.fontWeight) {
          range.setFontWeight(cellStyle.fontWeight);
        }
        if (cellStyle.fontStyle) {
          range.setFontStyle(cellStyle.fontStyle);
        }
        if (cellStyle.fontLine) {
          range.setFontLine(cellStyle.fontLine);
        }
        if (cellStyle.horizontalAlignment) {
          range.setHorizontalAlignment(cellStyle.horizontalAlignment);
        }
        if (cellStyle.verticalAlignment) {
          range.setVerticalAlignment(cellStyle.verticalAlignment);
        }
        if (typeof cellStyle.wrap === 'boolean') {
          range.setWrap(cellStyle.wrap);
        }
      }
    }
  }

  if (wrapFallback) {
    sheet.getRange(0, 0, rowCount, colCount).setWrap(true);
  }
}

async function loadSheetData(sheetData: Partial<SheetData> | undefined) {
  const normalized = normalizeRows(sheetData?.rows);
  const columnWidths = Array.isArray(sheetData?.columnWidths)
    ? sheetData.columnWidths
    : [];
  const merges = Array.isArray(sheetData?.merges) ? sheetData.merges : [];
  const rowHeights = Array.isArray(sheetData?.rowHeights)
    ? sheetData.rowHeights
    : [];
  const styles = Array.isArray(sheetData?.styles) ? sheetData.styles : [];
  const wrap = sheetData?.wrap ?? false;
  if (!univerResult) return;

  programmaticUpdating = true;
  createWorkbookWithRows(normalized);
  applyMerges(merges);
  applySheetLayout({
    columnWidths,
    rowHeights,
    rows: normalized,
    wrap,
  });
  applyCellStyles(normalized, styles, wrap);

  await nextTick();
  programmaticUpdating = false;
}

function getSheetData(): SheetData {
  const workbook = getActiveWorkbook();
  if (!workbook) return { merges: [], rows: [['']] };

  const sheet = workbook.getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const normalized = values.map((row: unknown[]) =>
    row.map((cell: unknown) => String(cell ?? '')),
  );
  const rows = trimRows(normalized);
  const merges = sheet.getMergeData().map((range) => {
    const mergeRange = range.getRange();
    return {
      endColumn: mergeRange.endColumn,
      endRow: mergeRange.endRow,
      startColumn: mergeRange.startColumn,
      startRow: mergeRange.startRow,
    };
  });
  return { merges, rows };
}

defineExpose({
  getSheetData,
  loadSheetData,
});

onMounted(async () => {
  if (!containerRef.value) return;
  const worker = new Worker(
    new URL('@univerjs/preset-sheets-core/lib/worker.js', import.meta.url),
    { type: 'module' },
  );
  formulaWorker = worker;

  univerResult = createUniver({
    locale: LocaleType.ZH_CN,
    locales: {
      [LocaleType.ZH_CN]: zhCN,
    },
    presets: [
      UniverSheetsCorePreset({
        container: containerRef.value,
        formulaBar: props.formulaBar,
        header: true,
        toolbar: props.toolbar,
        workerURL: worker,
      }),
    ],
  });

  await loadSheetData({ rows: [['']] });
});

onBeforeUnmount(() => {
  formulaWorker?.terminate();
  formulaWorker = null;

  workbookCommandDisposable?.dispose();
  workbookCommandDisposable = null;

  if (univerResult) {
    if (currentWorkbookId) {
      univerResult.univerAPI.disposeUnit(currentWorkbookId);
      currentWorkbookId = '';
    }
    univerResult.univer.dispose();
    univerResult = null;
  }
});
</script>

<template>
  <div
    ref="containerRef"
    class="univer-editor"
    :class="{ 'univer-editor-contained': !props.floatingPanels }"
    :style="{ height: `${props.height}px` }"
  ></div>
</template>

<style scoped>
.univer-editor {
  position: relative;
  z-index: 20;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}

.univer-editor-contained {
  contain: layout paint size;
  overflow: hidden;
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* Keep Univer popup/dropdown layers above surrounding form fields and modal body. */
.univer-editor :deep([data-radix-popper-content-wrapper]) {
  z-index: 3000 !important;
}

/* stylelint-disable-next-line selector-class-pattern */
.univer-editor :deep(.univer-z-\[15\]) {
  z-index: 3000 !important;
}

.univer-editor :deep([id^='univer-popup-portal']) {
  position: relative;
  z-index: 4000 !important;
}

.univer-editor :deep([data-u-comp='rect-popup']) {
  z-index: 4001 !important;
}

/* stylelint-disable-next-line selector-class-pattern */
.univer-editor :deep(.univer-z-\[1020\]) {
  z-index: 4001 !important;
}
</style>
