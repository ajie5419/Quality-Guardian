<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  Button,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Table,
  Upload,
} from 'ant-design-vue';

import { parseExcelWorkbookFromArrayBuffer } from '#/utils/excel-sheet';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

import UniverEditor from './UniverEditor.vue';

type TemplateField = {
  acceptanceCriteria?: string;
  checkItem?: string;
  lowerTolerance?: number;
  standardValue?: number;
  unit?: string;
  upperTolerance?: number;
};

type TemplatePayload = {
  attachments: string;
  formFields: TemplateField[];
  formName: string;
  partName: string;
  processName: string;
  projectName: string;
  status: 'active' | 'inactive';
  workOrderNumber: string;
};

type TemplateCurrent = {
  attachments?: string;
  formFields?: string | TemplateField[];
  formName?: string;
  id: string;
  partName?: string;
  processName?: string;
  projectName?: string;
  status?: 'active' | 'inactive';
  workOrderNumber?: string;
};

type UniverEditorRef = {
  getSheetData: () => {
    merges: SheetMerge[];
    rows: string[][];
  };
  loadSheetData: (sheetData: {
    columnWidths?: number[];
    merges: SheetMerge[];
    rowHeights?: number[];
    rows: string[][];
    styles?: Array<Array<null | Record<string, unknown>>>;
  }) => Promise<void>;
};
type SheetMerge = {
  endColumn: number;
  endRow: number;
  startColumn: number;
  startRow: number;
};

const props = defineProps<{
  current?: null | TemplateCurrent;
  open: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [payload: TemplatePayload];
}>();

const accessStore = useAccessStore();

const formState = reactive<TemplatePayload>({
  attachments: '',
  formFields: [],
  formName: '',
  partName: '',
  processName: '',
  projectName: '',
  status: 'active',
  workOrderNumber: '',
});

const isEdit = computed(() => Boolean(props.current?.id));

const processOptions = [
  { label: '原材料', value: '原材料' },
  { label: '外购件', value: '外购件' },
  { label: '辅材', value: '辅材' },
  { label: '机加成品件', value: '机加成品件' },
  { label: '下料', value: '下料' },
  { label: '组对', value: '组对' },
  { label: '焊接', value: '焊接' },
  { label: '焊后尺寸', value: '焊后尺寸' },
  { label: '外观', value: '外观' },
  { label: '整体拼装', value: '整体拼装' },
  { label: '组拼', value: '组拼' },
  { label: '组焊', value: '组焊' },
  { label: '涂装', value: '涂装' },
  { label: '喷漆', value: '喷漆' },
  { label: '组装', value: '组装' },
  { label: '装配', value: '装配' },
  { label: '打砂', value: '打砂' },
  { label: '发货检验', value: '发货检验' },
];

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

const editorRef = ref<UniverEditorRef>();
const spreadsheetRows = ref<string[][]>([['']]);
const spreadsheetMerges = ref<SheetMerge[]>([]);
const spreadsheetColumnWidths = ref<number[]>([]);
const spreadsheetRowHeights = ref<number[]>([]);
const spreadsheetStyles = ref<Array<Array<null | Record<string, unknown>>>>([]);
const spreadsheetExcelStyles = ref<
  Array<Array<null | Record<string, unknown>>>
>([]);
const spreadsheetFileName = ref('inspection-template.xlsx');
const sheetOptions = ref<Array<{ label: string; value: string }>>([]);
const sheetDataByName = ref<
  Record<
    string,
    {
      columnWidths: number[];
      excelStyles: Array<Array<null | Record<string, unknown>>>;
      merges: SheetMerge[];
      rowHeights: number[];
      rows: string[][];
      styles: Array<Array<null | Record<string, unknown>>>;
    }
  >
>({});
const selectedSheetName = ref('');
const spreadsheetDirty = ref(false);
const uploadingEditedFile = ref(false);
const initialFormSignature = ref('');
const showRawSpreadsheetEditor = ref(false);

const fieldTableColumns = [
  { title: '序号', dataIndex: '__index', width: 70 },
  { title: '检验项目', dataIndex: 'checkItem', width: 220 },
  { title: '判定标准', dataIndex: 'acceptanceCriteria', width: 420 },
  { title: '操作', dataIndex: 'actions', width: 90 },
];

const fieldTableData = computed(() =>
  (formState.formFields || []).map((field, index) => ({
    ...field,
    __index: index + 1,
    __rowIndex: index,
  })),
);

const modalConfirmLoading = computed(
  () => props.saving || uploadingEditedFile.value,
);

function createDefaultSheetRows() {
  return [
    ['检验项', '判定标准', '标准值', '上偏差', '下偏差', '单位'],
    ['', '', '', '', '', ''],
  ];
}

function normalizeFields(fields: TemplateField[]) {
  return fields
    .map((field) => ({
      acceptanceCriteria: String(field.acceptanceCriteria || '').trim(),
      checkItem: String(field.checkItem || '').trim(),
      lowerTolerance:
        field.lowerTolerance === undefined
          ? undefined
          : Number(field.lowerTolerance),
      standardValue:
        field.standardValue === undefined
          ? undefined
          : Number(field.standardValue),
      unit: String(field.unit || '').trim(),
      upperTolerance:
        field.upperTolerance === undefined
          ? undefined
          : Number(field.upperTolerance),
    }))
    .filter((field) => field.checkItem);
}

function cleanBilingualCellText(value: unknown) {
  const raw = String(value || '')
    .replaceAll('\u00A0', ' ')
    .replaceAll('\u3000', ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  if (!raw) return '';

  // 中英文/数字相邻时补空格，提升可读性
  return raw
    .replaceAll(/([\u4E00-\u9FFF])([A-Z0-9])/gi, '$1 $2')
    .replaceAll(/([A-Z0-9])([\u4E00-\u9FFF])/gi, '$1 $2')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function normalizeSheetRows(rawRows: (number | string)[][]) {
  return rawRows.map((row) => row.map((cell) => cleanBilingualCellText(cell)));
}

function applySheetDataToEditor(
  rows: string[][],
  merges: SheetMerge[] = [],
  columnWidths: number[] = [],
  rowHeights: number[] = [],
  styles: Array<Array<null | Record<string, unknown>>> = [],
  excelStyles: Array<Array<null | Record<string, unknown>>> = [],
) {
  spreadsheetRows.value = rows;
  spreadsheetMerges.value = merges;
  spreadsheetColumnWidths.value = columnWidths;
  spreadsheetRowHeights.value = rowHeights;
  spreadsheetStyles.value = styles;
  spreadsheetExcelStyles.value = excelStyles;
  spreadsheetDirty.value = false;
  void nextTick(async () => {
    await editorRef.value?.loadSheetData({
      columnWidths,
      merges,
      rowHeights,
      rows,
      styles: styles as any,
    });
  });
}

function applySheetByName(name: string) {
  const sheet = sheetDataByName.value[name];
  if (!sheet) return false;
  selectedSheetName.value = name;
  applySheetDataToEditor(
    sheet.rows,
    sheet.merges,
    sheet.columnWidths,
    sheet.rowHeights,
    sheet.styles,
    sheet.excelStyles,
  );
  return true;
}

function syncCurrentSheetSnapshot() {
  const currentName = selectedSheetName.value;
  if (!currentName) return;
  const exists = sheetDataByName.value[currentName];
  if (!exists) return;

  const sheetData = getEditorSheetData();
  sheetDataByName.value[currentName] = {
    columnWidths: sheetData.columnWidths,
    excelStyles: spreadsheetExcelStyles.value,
    merges: sheetData.merges,
    rowHeights: sheetData.rowHeights,
    rows: sheetData.rows,
    styles: sheetData.styles as Array<Array<null | Record<string, unknown>>>,
  };
}

function isExcelLikeFile(fileName: string) {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')
  );
}

function inferFileNameFromAttachmentUrl(url: string) {
  const clean =
    String(url || '')
      .split('?')[0]
      ?.split('#')[0] || '';
  const segment = clean.split('/').pop() || '';
  if (!segment) return '';

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function loadSpreadsheetFromFile(file: File) {
  try {
    const buffer = await file.arrayBuffer();
    const parsedWorkbook = await parseExcelWorkbookFromArrayBuffer(buffer);
    if (!parsedWorkbook || parsedWorkbook.sheets.length === 0) {
      message.warning('读取失败：文件没有工作表');
      return;
    }
    const nextMap: Record<
      string,
      {
        columnWidths: number[];
        excelStyles: Array<Array<null | Record<string, unknown>>>;
        merges: SheetMerge[];
        rowHeights: number[];
        rows: string[][];
        styles: Array<Array<null | Record<string, unknown>>>;
      }
    > = {};
    const nextOptions: Array<{ label: string; value: string }> = [];
    for (const sheet of parsedWorkbook.sheets) {
      const normalizedRows = normalizeSheetRows(sheet.data.rows);
      const name = sheet.name || `Sheet${sheet.index + 1}`;
      nextMap[name] = {
        columnWidths: sheet.data.columnWidths,
        excelStyles: sheet.data.excelStyles as Array<
          Array<null | Record<string, unknown>>
        >,
        merges: sheet.data.merges as SheetMerge[],
        rowHeights: sheet.data.rowHeights,
        rows: normalizedRows,
        styles: sheet.data.styles as Array<
          Array<null | Record<string, unknown>>
        >,
      };
      nextOptions.push({ label: name, value: name });
    }
    if (nextOptions.length === 0) {
      message.warning('读取失败：所有分页都为空');
      return;
    }
    sheetDataByName.value = nextMap;
    sheetOptions.value = nextOptions;
    const activeSheet =
      parsedWorkbook.sheets[parsedWorkbook.activeSheetIndex] ||
      parsedWorkbook.sheets[0];
    const firstSheetName =
      (activeSheet?.name &&
        nextOptions.find((item) => item.value === activeSheet.name)?.value) ||
      nextOptions[0]!.value;
    applySheetByName(firstSheetName);
    if (nextOptions.length > 1) {
      message.success(
        `Excel 已识别 ${nextOptions.length} 个分页，请选择要编辑的分页`,
      );
    } else {
      message.success('Excel 已加载，可直接在线编辑单元格');
    }

    const mergedRows: string[][] = [];
    for (const sheet of Object.values(nextMap)) {
      mergedRows.push(...expandRowsByMerges(sheet.rows, sheet.merges));
    }
    const parsedFields = autoBuildFormFieldsFromRows(mergedRows);
    if (parsedFields.length > 0) {
      formState.formFields = parsedFields;
      message.success(`已按字段识别 ${parsedFields.length} 条检验项`);
    } else {
      message.warning('未识别到检验项，请在下方字段表格手动补充');
    }
  } catch {
    message.error('读取失败，请检查 Excel/CSV 文件格式');
  }
}

function addFormFieldRow() {
  formState.formFields = [
    ...(formState.formFields || []),
    {
      acceptanceCriteria: '',
      checkItem: '',
    },
  ];
}

function removeFormFieldRow(index: number) {
  formState.formFields = (formState.formFields || []).filter(
    (_, idx) => idx !== index,
  );
}

function getFormFieldCellValue(index: number, key: keyof TemplateField) {
  return formState.formFields?.[index]?.[key] ?? '';
}

function setFormFieldCellValue(
  index: number,
  key: keyof TemplateField,
  value: string,
) {
  const row = formState.formFields?.[index];
  if (!row) return;
  row[key] = value as never;
}

function collectAllSheetRowsForFieldBuild() {
  syncCurrentSheetSnapshot();
  const all = Object.values(sheetDataByName.value);
  if (all.length === 0) {
    return [
      ...expandRowsByMerges(
        getEditorSheetData().rows,
        getEditorSheetData().merges,
      ),
    ];
  }

  const mergedRows: string[][] = [];
  for (const sheet of all) {
    const expanded = expandRowsByMerges(sheet.rows, sheet.merges);
    if (expanded.length === 0) continue;
    mergedRows.push(...expanded);
  }
  return mergedRows;
}

async function uploadFileToServer(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    body: formData,
    headers: {
      Authorization: `Bearer ${accessStore.accessToken}`,
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`upload failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    code?: number;
    data?: { url?: string };
  };

  if (data?.code !== 0 || !data.data?.url) {
    throw new Error('invalid upload response');
  }

  return data.data.url;
}

function parseNumber(value: string): number | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const num = Number(raw);
  return Number.isNaN(num) ? undefined : num;
}

function normalizeHeaderKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_/()（）【】:：-]/g, '');
}

function expandRowsByMerges(rows: string[][], merges: SheetMerge[]) {
  if (rows.length === 0 || merges.length === 0) return rows;

  const maxRow = Math.max(
    rows.length - 1,
    ...merges.map((merge) => merge.endRow),
  );
  const maxCol = Math.max(
    0,
    ...rows.map((row) => row.length - 1),
    ...merges.map((merge) => merge.endColumn),
  );

  const matrix = Array.from({ length: maxRow + 1 }).map((_, rowIndex) =>
    Array.from({ length: maxCol + 1 }).map((_, colIndex) =>
      String(rows[rowIndex]?.[colIndex] || ''),
    ),
  );

  for (const merge of merges) {
    const anchor = matrix[merge.startRow]?.[merge.startColumn] || '';
    for (let row = merge.startRow; row <= merge.endRow; row++) {
      const rowCells = matrix[row];
      if (!rowCells) continue;
      for (let col = merge.startColumn; col <= merge.endColumn; col++) {
        if (!rowCells[col]) {
          rowCells[col] = anchor;
        }
      }
    }
  }

  return matrix;
}

function autoBuildFormFieldsFromRows(rows: string[][]) {
  if (rows.length === 0) return [];

  const dimensionFields = parseDimensionInspectionFields(rows);
  if (dimensionFields.length > 0) return dimensionFields;

  const weldFields = parseWeldInspectionFields(rows);
  if (weldFields.length > 0) return weldFields;

  const fallbackFields = parseSimpleFixedColumns(rows);
  if (fallbackFields.length > 0) return fallbackFields;

  return parseBilingualInspectionFields(rows);
}

function parseSimpleFixedColumns(rows: string[][]) {
  const headerRow = new Set(
    (rows[0] || []).map((cell) => normalizeHeaderKey(cell)),
  );
  const hasHeader =
    headerRow.has(normalizeHeaderKey('检验项')) ||
    headerRow.has(normalizeHeaderKey('判定标准')) ||
    headerRow.has(normalizeHeaderKey('标准值')) ||
    headerRow.has(normalizeHeaderKey('上偏差')) ||
    headerRow.has(normalizeHeaderKey('下偏差')) ||
    headerRow.has(normalizeHeaderKey('单位'));
  const startRow = hasHeader ? 1 : 0;

  const fields: TemplateField[] = [];
  for (const row of rows.slice(startRow)) {
    const checkItem = String(row[0] || '').trim();
    if (!checkItem) continue;

    fields.push({
      acceptanceCriteria: String(row[1] || '').trim(),
      checkItem,
      lowerTolerance: parseNumber(row[4] || ''),
      standardValue: parseNumber(row[2] || ''),
      unit: String(row[5] || '').trim(),
      upperTolerance: parseNumber(row[3] || ''),
    });
  }

  return normalizeFields(fields);
}

function parseRequirementText(requirementText: string) {
  const text = String(requirementText || '').replaceAll(/\s+/g, '');
  let standardValue: number | undefined;
  let upperTolerance: number | undefined;
  let lowerTolerance: number | undefined;

  const plusMinusMatch = text.match(/^(-?\d+(?:\.\d+)?)±(\d+(?:\.\d+)?)$/);
  if (plusMinusMatch) {
    standardValue = parseNumber(plusMinusMatch[1] || '');
    upperTolerance = parseNumber(plusMinusMatch[2] || '');
    lowerTolerance = parseNumber(plusMinusMatch[2] || '');
    return { lowerTolerance, standardValue, upperTolerance };
  }

  const lteMatch = text.match(/^≤(-?\d+(?:\.\d+)?)$/);
  if (lteMatch) {
    standardValue = parseNumber(lteMatch[1] || '');
    return { lowerTolerance, standardValue, upperTolerance };
  }

  const gteMatch = text.match(/^≥(-?\d+(?:\.\d+)?)$/);
  if (gteMatch) {
    standardValue = parseNumber(gteMatch[1] || '');
    return { lowerTolerance, standardValue, upperTolerance };
  }

  return { lowerTolerance, standardValue, upperTolerance };
}

function isConclusionRow(row: string[]) {
  const merged = row
    .map((cell) => String(cell || ''))
    .join(' ')
    .replaceAll(/\s+/g, '')
    .toLowerCase();
  return merged.includes('检验结论') || merged.includes('inspectionconclusion');
}

function parseDimensionInspectionFields(rows: string[][]) {
  const norm = (value: unknown) =>
    String(value || '')
      .replaceAll(/\s+/g, '')
      .toLowerCase();
  const includeAny = (text: string, keys: string[]) =>
    keys.some((key) => text.includes(norm(key)));

  const headerRowIndex = rows.findIndex((row) => {
    const merged = row.map((cell) => norm(cell)).join('|');
    const hasNo = includeAny(merged, ['序号', 'no']);
    const hasItem = includeAny(merged, ['检验项目', 'item']);
    const hasRequirement = includeAny(merged, ['标准要求', 'requirement']);
    const hasActual = includeAny(merged, ['实测值', 'value']);
    return hasNo && hasItem && hasRequirement && hasActual;
  });

  if (headerRowIndex === -1) return [];

  const headerRow = rows[headerRowIndex] || [];
  const findCol = (aliases: string[]) =>
    headerRow.findIndex((cell) => includeAny(norm(cell), aliases));

  const noCol = findCol(['序号', 'no']);
  const itemCol = findCol(['检验项目', 'item']);
  const requirementCol = findCol(['标准要求', 'requirement']);
  const actualCol = findCol(['实测值', 'value']);

  if (noCol < 0 || itemCol < 0 || requirementCol < 0 || actualCol < 0) {
    return [];
  }

  const parsed: TemplateField[] = [];
  for (const row of rows.slice(headerRowIndex + 1)) {
    if (isConclusionRow(row)) break;

    const noText = String(row[noCol] || '').trim();
    if (!/^\d+$/.test(noText)) continue;

    const itemText = String(row[itemCol] || '').trim();
    const requirementText = String(row[requirementCol] || '').trim();
    const actualText = String(row[actualCol] || '').trim();
    if (!itemText && !requirementText && !actualText) continue;

    const { lowerTolerance, standardValue, upperTolerance } =
      parseRequirementText(requirementText);
    parsed.push({
      acceptanceCriteria: requirementText || actualText,
      checkItem: itemText || `尺寸检验-${noText}`,
      lowerTolerance,
      standardValue,
      unit:
        requirementText.includes('mm') || actualText.includes('mm') ? 'mm' : '',
      upperTolerance,
    });
  }

  return normalizeFields(parsed);
}

function parseWeldInspectionFields(rows: string[][]) {
  const norm = (value: unknown) =>
    String(value || '')
      .replaceAll(/\s+/g, '')
      .toLowerCase();
  const includeAny = (text: string, keys: string[]) =>
    keys.some((key) => text.includes(norm(key)));

  const headerRowIndex = rows.findIndex((row) => {
    const merged = row.map((cell) => norm(cell)).join('|');
    const hasItem = includeAny(merged, ['项目', 'item']);
    const hasRequirement = includeAny(merged, ['标准要求', 'requirement']);
    const hasActual = includeAny(merged, ['实测值', 'value']);
    const hasResult = includeAny(merged, ['判定', 'result']);
    return hasItem && hasRequirement && hasActual && hasResult;
  });

  if (headerRowIndex === -1) return [];

  const headerRow = rows[headerRowIndex] || [];
  const findCol = (aliases: string[]) =>
    headerRow.findIndex((cell) => includeAny(norm(cell), aliases));

  const itemCol = findCol(['项目', 'item']);
  const requirementCol = findCol(['标准要求', 'requirement']);
  const actualCol = findCol(['实测值', 'value']);
  const resultCol = findCol(['判定', 'result']);

  if (itemCol < 0 || requirementCol < 0 || actualCol < 0 || resultCol < 0) {
    return [];
  }

  const parsed: TemplateField[] = [];
  let currentGroup = '';

  for (const row of rows.slice(headerRowIndex + 1)) {
    if (isConclusionRow(row)) break;

    const itemText = String(row[itemCol] || '').trim();
    const requirementText = String(row[requirementCol] || '').trim();
    const actualText = String(row[actualCol] || '').trim();
    const resultText = String(row[resultCol] || '').trim();
    if (!itemText && !requirementText && !actualText && !resultText) continue;

    if (itemText && !requirementText && !actualText && !resultText) {
      currentGroup = itemText;
      continue;
    }

    const { lowerTolerance, standardValue, upperTolerance } =
      parseRequirementText(requirementText);
    parsed.push({
      acceptanceCriteria: requirementText || resultText || actualText,
      checkItem: currentGroup ? `${currentGroup} - ${itemText}` : itemText,
      lowerTolerance,
      standardValue,
      unit:
        requirementText.includes('mm') || actualText.includes('mm') ? 'mm' : '',
      upperTolerance,
    });
  }

  return normalizeFields(parsed);
}

function parseBilingualInspectionFields(rows: string[][]) {
  const norm = (value: unknown) =>
    String(value || '')
      .replaceAll(/\s+/g, '')
      .toLowerCase();

  const includeAny = (text: string, keys: string[]) =>
    keys.some((key) => text.includes(norm(key)));

  const headerRowIndex = rows.findIndex((row) => {
    const merged = row.map((cell) => norm(cell)).join('|');
    const hasItem = includeAny(merged, ['检验项目', 'item']);
    const hasRequirement = includeAny(merged, ['标准要求', 'requirement']);
    const hasActual = includeAny(merged, ['实测值', 'actual', 'actualvalue']);
    return hasItem && hasRequirement && hasActual;
  });

  if (headerRowIndex === -1) return [];

  const headerRow = rows[headerRowIndex] || [];
  const findCol = (aliases: string[]) =>
    headerRow.findIndex((cell) => includeAny(norm(cell), aliases));

  // 该类模板常见布局：A序号 B/C检验项目 D标准要求 E/F实测值 G备注
  const itemCol =
    findCol(['检验项目', 'item']) >= 0 ? findCol(['检验项目', 'item']) : 1;
  const requirementCol =
    findCol(['标准要求', 'requirement']) >= 0
      ? findCol(['标准要求', 'requirement'])
      : 3;
  const actualCol =
    findCol(['实测值', 'actual', 'actualvalue']) >= 0
      ? findCol(['实测值', 'actual', 'actualvalue'])
      : 4;
  const remarkCol = findCol(['备注', 'remark']);

  const parsed: TemplateField[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const rawItemText = String(row[itemCol] || row[itemCol + 1] || '').trim();
    const requirementText = String(row[requirementCol] || '').trim();
    const actualText = String(
      row[actualCol] || row[actualCol + 1] || '',
    ).trim();
    const remarkText =
      remarkCol >= 0 ? String(row[remarkCol] || '').trim() : '';

    // 空行跳过
    if (!rawItemText && !requirementText && !actualText && !remarkText)
      continue;

    let itemText = rawItemText;
    // 中英尺寸检验表里常见“检验项目列=序号”，这里自动生成可用检验项名
    if (!itemText && /^\d+(?:\.\d+)?$/.test(String(row[0] || '').trim())) {
      itemText = `尺寸检验-${String(row[0] || '').trim()}`;
    } else if (/^\d+(?:\.\d+)?$/.test(itemText)) {
      itemText = `尺寸检验-${itemText}`;
    }
    if (!itemText) continue;

    const requirementMatch = requirementText.match(
      /^(-?\d+(?:\.\d+)?)\s*[±+-]\s*(\d+(?:\.\d+)?)$/,
    );

    let standardValue: number | undefined;
    let upperTolerance: number | undefined;
    let lowerTolerance: number | undefined;
    if (requirementMatch) {
      standardValue = parseNumber(requirementMatch[1] || '');
      upperTolerance = parseNumber(requirementMatch[2] || '');
      lowerTolerance = parseNumber(requirementMatch[2] || '');
    }

    parsed.push({
      checkItem: itemText,
      acceptanceCriteria: requirementText || actualText || remarkText,
      standardValue,
      upperTolerance,
      lowerTolerance,
      unit:
        includeAny(requirementText, ['mm']) || includeAny(actualText, ['mm'])
          ? 'mm'
          : '',
    });
  }

  return normalizeFields(parsed);
}

function getEditorSheetData() {
  const sheetData = editorRef.value?.getSheetData();
  return {
    columnWidths: spreadsheetColumnWidths.value,
    merges: sheetData?.merges || spreadsheetMerges.value,
    rowHeights: spreadsheetRowHeights.value,
    rows: (sheetData?.rows || spreadsheetRows.value).map((row) =>
      row.map((cell) => String(cell || '')),
    ),
    styles: spreadsheetStyles.value,
  };
}

function buildFormSignature() {
  return JSON.stringify({
    attachments: formState.attachments,
    formName: formState.formName,
    partName: formState.partName,
    processName: formState.processName,
    projectName: formState.projectName,
    status: formState.status,
    workOrderNumber: formState.workOrderNumber,
    ...getEditorSheetData(),
  });
}

function hasUnsavedChanges() {
  if (spreadsheetDirty.value) return true;
  return buildFormSignature() !== initialFormSignature.value;
}

async function saveEditedSpreadsheetAndOverwriteAttachment() {
  syncCurrentSheetSnapshot();

  const allSheets = Object.entries(sheetDataByName.value);
  const singleSheetData = getEditorSheetData();
  if (allSheets.length === 0 && singleSheetData.rows.length === 0) {
    message.warning('请先上传并编辑 Excel');
    return false;
  }

  uploadingEditedFile.value = true;
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheetsToWrite =
      allSheets.length > 0
        ? allSheets
        : [
            [
              'Sheet1',
              {
                columnWidths: singleSheetData.columnWidths,
                excelStyles: spreadsheetExcelStyles.value,
                merges: singleSheetData.merges,
                rowHeights: singleSheetData.rowHeights,
                rows: singleSheetData.rows,
                styles: singleSheetData.styles,
              },
            ] as const,
          ];

    for (const [sheetName, sheet] of sheetsToWrite) {
      const worksheet = workbook.addWorksheet(sheetName || 'Sheet');

      sheet.rows.forEach((row, rowIndex) => {
        row.forEach((value, colIndex) => {
          worksheet.getCell(rowIndex + 1, colIndex + 1).value = String(
            value || '',
          );
        });
      });

      for (const merge of sheet.merges || []) {
        worksheet.mergeCells(
          merge.startRow + 1,
          merge.startColumn + 1,
          merge.endRow + 1,
          merge.endColumn + 1,
        );
      }

      (sheet.columnWidths || []).forEach((pxWidth, colIndex) => {
        if (!Number.isFinite(pxWidth) || pxWidth <= 0) return;
        worksheet.getColumn(colIndex + 1).width = Number(
          Math.max(4, (pxWidth - 16) / 8).toFixed(2),
        );
      });

      (sheet.rowHeights || []).forEach((pxHeight, rowIndex) => {
        if (!Number.isFinite(pxHeight) || pxHeight <= 0) return;
        worksheet.getRow(rowIndex + 1).height = Number(
          ((pxHeight * 72) / 96).toFixed(2),
        );
      });

      (sheet.excelStyles || []).forEach((styleRow, rowIndex) => {
        styleRow?.forEach((rawStyle, colIndex) => {
          if (!rawStyle) return;
          try {
            worksheet.getCell(rowIndex + 1, colIndex + 1).style =
              structuredClone(rawStyle);
          } catch {
            // ignore individual style clone failure
          }
        });
      });
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

    const editedFile = new File(
      [buffer],
      isExcelLikeFile(spreadsheetFileName.value)
        ? spreadsheetFileName.value
        : 'inspection-template.xlsx',
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    );

    const url = await uploadFileToServer(editedFile);
    formState.attachments = url;
    spreadsheetDirty.value = false;
    message.success('已保存并覆盖当前附件');
    return true;
  } catch {
    message.error('覆盖附件失败，请稍后重试');
    return false;
  } finally {
    uploadingEditedFile.value = false;
  }
}

function buildStandardizedSheetRows(fields: TemplateField[]) {
  const rows: string[][] = [
    ['序号', '检验项目', '标准要求', '实测值', '判定', '备注'],
  ];

  const normalized = fields
    .map((field) => {
      const checkItem = String(field.checkItem || '').trim();
      const criteria = String(field.acceptanceCriteria || '').trim();
      const requirement = criteria;
      return {
        checkItem,
        requirement,
      };
    })
    .filter((item) => item.checkItem && item.requirement);

  normalized.forEach((field, index) => {
    rows.push([
      String(index + 1),
      field.checkItem,
      field.requirement,
      '',
      '',
      '',
    ]);
  });

  return rows;
}

async function saveStandardizedSpreadsheetAndOverwriteAttachment() {
  uploadingEditedFile.value = true;
  try {
    const fields = normalizeFields(formState.formFields);
    if (fields.length === 0) {
      message.warning('未识别到可标准化的检验项');
      return false;
    }

    const rows = buildStandardizedSheetRows(fields);
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('标准检验表');

    rows.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const cell = worksheet.getCell(rowIndex + 1, colIndex + 1);
        cell.value = value;
      });
    });

    const headerRowIndex = 1;
    worksheet.getRow(headerRowIndex).font = { bold: true };
    worksheet.getRow(headerRowIndex).alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };

    const borderStyle = {
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
      top: { style: 'thin' },
    } as const;
    const headerFill = {
      fgColor: { argb: 'FFEFEFEF' },
      pattern: 'solid',
      type: 'pattern',
    } as const;
    const bodyFill = {
      fgColor: { argb: 'FFF5F5F5' },
      pattern: 'solid',
      type: 'pattern',
    } as const;
    const emptyInputFill = {
      fgColor: { argb: 'FFE8E8E8' },
      pattern: 'solid',
      type: 'pattern',
    } as const;
    for (let row = 1; row <= rows.length; row++) {
      for (let col = 1; col <= 6; col++) {
        const cell = worksheet.getCell(row, col);
        cell.border = borderStyle;
        cell.fill = row === headerRowIndex ? headerFill : bodyFill;
        if (row >= headerRowIndex) {
          cell.alignment = {
            horizontal: col === 1 ? 'center' : 'left',
            vertical: 'middle',
            wrapText: true,
          };
        }
        if (
          row > headerRowIndex &&
          col >= 4 &&
          !String(cell.value || '').trim()
        ) {
          cell.fill = emptyInputFill;
        }
      }
    }

    const widths = [8, 32, 32, 16, 14, 24];
    widths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });

    worksheet.getRow(headerRowIndex).height = 24;

    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const standardizedFile = new File(
      [buffer],
      `${formState.formName.trim() || 'inspection'}-标准检验表.xlsx`,
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    );
    const url = await uploadFileToServer(standardizedFile);
    formState.attachments = url;
    spreadsheetFileName.value = standardizedFile.name;
    spreadsheetDirty.value = false;

    sheetOptions.value = [{ label: '标准检验表', value: '标准检验表' }];
    selectedSheetName.value = '标准检验表';
    sheetDataByName.value = {
      标准检验表: {
        columnWidths: [],
        excelStyles: [],
        merges: [],
        rowHeights: [],
        rows,
        styles: [],
      },
    };
    applySheetDataToEditor(rows, []);

    message.success('已转为标准检验表并覆盖附件');
    return true;
  } catch {
    message.warning('标准化转换失败，已回退到原始覆盖方式');
    return await saveEditedSpreadsheetAndOverwriteAttachment();
  } finally {
    uploadingEditedFile.value = false;
  }
}

async function handleSaveEditedAttachment() {
  if (!validatePayload()) return;
  await saveStandardizedSpreadsheetAndOverwriteAttachment();
}

function handleEditorDirty() {
  spreadsheetDirty.value = true;
}

function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
  const uploadedFileName = String(info.file?.name || '').trim();
  if (info.file.status === 'done') {
    const response = info.file.response as
      | undefined
      | {
          code?: number;
          data?: { url?: string };
        };

    if (response?.code === 0 && response.data?.url) {
      formState.attachments = response.data.url;
      if (uploadedFileName) {
        spreadsheetFileName.value = uploadedFileName;
      }
      message.success('附件上传成功');

      if (isExcelLikeFile(uploadedFileName)) {
        const originFile = info.file.originFileObj;
        if (originFile instanceof File) {
          void loadSpreadsheetFromFile(originFile);
        }
      }
    } else {
      message.warning('附件上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error('附件上传失败');
  }
}

function resetForm() {
  formState.workOrderNumber = '';
  formState.projectName = '';
  formState.formName = '';
  formState.partName = '';
  formState.processName = '';
  formState.attachments = '';
  formState.status = 'active';
  formState.formFields = [];

  spreadsheetFileName.value = 'inspection-template.xlsx';
  sheetOptions.value = [];
  sheetDataByName.value = {};
  selectedSheetName.value = '';
  applySheetDataToEditor(createDefaultSheetRows(), []);
  initialFormSignature.value = buildFormSignature();
}

function fillByCurrent() {
  const current = props.current;
  if (!current) {
    resetForm();
    return;
  }

  formState.workOrderNumber = String(current.workOrderNumber || '').trim();
  formState.projectName = String(current.projectName || '').trim();
  formState.formName = String(current.formName || '').trim();
  formState.partName = String(current.partName || '').trim();
  formState.processName = String(current.processName || '').trim();
  formState.attachments = String(current.attachments || '').trim();
  formState.status = current.status === 'inactive' ? 'inactive' : 'active';

  const inferredFileName = inferFileNameFromAttachmentUrl(
    formState.attachments,
  );
  spreadsheetFileName.value = inferredFileName || 'inspection-template.xlsx';

  let parsedFields: TemplateField[] = [];
  if (Array.isArray(current.formFields)) {
    parsedFields = current.formFields;
  } else {
    try {
      const parsed = JSON.parse(String(current.formFields || '[]'));
      parsedFields = Array.isArray(parsed) ? parsed : [];
    } catch {
      parsedFields = [];
    }
  }

  if (parsedFields.length > 0) {
    sheetOptions.value = [];
    sheetDataByName.value = {};
    selectedSheetName.value = '';
    applySheetDataToEditor(
      [
        ['检验项', '判定标准', '标准值', '上偏差', '下偏差', '单位'],
        ...parsedFields.map((field) => [
          String(field.checkItem || ''),
          String(field.acceptanceCriteria || ''),
          String(field.standardValue ?? ''),
          String(field.upperTolerance ?? ''),
          String(field.lowerTolerance ?? ''),
          String(field.unit || ''),
        ]),
      ],
      [],
    );
  } else {
    sheetOptions.value = [];
    sheetDataByName.value = {};
    selectedSheetName.value = '';
    applySheetDataToEditor(createDefaultSheetRows(), []);
  }

  initialFormSignature.value = buildFormSignature();
}

function handleSheetChange(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const sheetName = String(raw || '').trim();
  if (!sheetName) return;
  syncCurrentSheetSnapshot();
  applySheetByName(sheetName);
}

function handleWorkOrderChange(
  val: string | undefined,
  option: { item?: { projectName?: string } },
) {
  formState.workOrderNumber = String(val || '').trim();
  if (!formState.projectName) {
    formState.projectName = String(option?.item?.projectName || '').trim();
  }
}

function validatePayload() {
  if (!formState.workOrderNumber) {
    message.warning('请选择工单号');
    return false;
  }
  if (!formState.formName) {
    message.warning('请填写检验表名称');
    return false;
  }
  if (!formState.processName) {
    message.warning('请选择工序/检验场景');
    return false;
  }

  let normalizedFields = normalizeFields(formState.formFields || []);
  if (normalizedFields.length === 0) {
    normalizedFields = autoBuildFormFieldsFromRows(
      collectAllSheetRowsForFieldBuild(),
    );
  }
  if (normalizedFields.length === 0) {
    message.warning('请至少维护 1 条有效检验项');
    return false;
  }

  formState.formFields = normalizedFields;
  return true;
}

async function handleSubmit() {
  if (!validatePayload()) return;

  if (spreadsheetDirty.value || !formState.attachments) {
    const ok = await saveStandardizedSpreadsheetAndOverwriteAttachment();
    if (!ok) return;
  }

  emit('submit', {
    attachments: formState.attachments.trim(),
    formFields: normalizeFields(formState.formFields),
    formName: formState.formName.trim(),
    partName: formState.partName.trim(),
    processName: formState.processName.trim(),
    projectName: formState.projectName.trim(),
    status: formState.status,
    workOrderNumber: formState.workOrderNumber.trim(),
  });
}

function handleCancel() {
  if (!hasUnsavedChanges()) {
    emit('cancel');
    return;
  }

  Modal.confirm({
    title: '存在未保存内容',
    content: '当前上传/编辑内容尚未保存，确认退出吗？',
    onOk: () => {
      emit('cancel');
    },
  });
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      fillByCurrent();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="open"
    :title="isEdit ? '编辑检验表模板' : '新增检验表模板'"
    :confirm-loading="modalConfirmLoading"
    wrap-class-name="qms-template-modal"
    width="1280px"
    @cancel="handleCancel"
    @ok="() => void handleSubmit()"
  >
    <div class="grid grid-cols-3 gap-3">
      <div>
        <div class="mb-1 text-gray-700">工单号</div>
        <WorkOrderSelect
          :value="formState.workOrderNumber"
          placeholder="请选择工单"
          @change="handleWorkOrderChange"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">项目名称</div>
        <Input
          v-model:value="formState.projectName"
          placeholder="自动带出，可修改"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">检验表名称</div>
        <Input
          v-model:value="formState.formName"
          placeholder="如：总装过程检验表"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">工序/检验场景</div>
        <Select
          v-model:value="formState.processName"
          :options="processOptions"
          allow-clear
          show-search
          placeholder="请选择"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">部件名称（可选）</div>
        <Input
          v-model:value="formState.partName"
          placeholder="同工序不同部件时填写，如：主梁、减速机"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">状态</div>
        <Select
          v-model:value="formState.status"
          :options="[
            { label: '启用', value: 'active' },
            { label: '停用', value: 'inactive' },
          ]"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-700">附件链接</div>
        <Input
          v-model:value="formState.attachments"
          placeholder="上传并保存后自动覆盖为新附件地址"
        />
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <Upload
        action="/api/upload"
        accept=".xlsx,.xls,.csv"
        :headers="uploadHeaders"
        :show-upload-list="false"
        name="file"
        @change="handleAttachmentUploadChange"
      >
        <Button>上传 Excel</Button>
      </Upload>
      <Button
        :loading="uploadingEditedFile"
        type="primary"
        @click="handleSaveEditedAttachment"
      >
        转标准表并覆盖附件
      </Button>
      <Button @click="showRawSpreadsheetEditor = !showRawSpreadsheetEditor">
        {{ showRawSpreadsheetEditor ? '隐藏原始表格' : '查看原始表格' }}
      </Button>
      <Button @click="addFormFieldRow">新增检验项</Button>
      <span class="text-xs text-gray-500">
        当前文件：{{ spreadsheetFileName }}
        <template v-if="spreadsheetDirty">（有未保存修改）</template>
      </span>
      <Select
        v-if="sheetOptions.length > 1"
        :options="sheetOptions"
        :value="selectedSheetName"
        class="w-[260px]"
        placeholder="选择 Excel 分页"
        @change="handleSheetChange"
      />
    </div>

    <div class="mt-3 rounded border border-gray-200 p-2">
      <Table
        :columns="fieldTableColumns"
        :data-source="fieldTableData"
        :pagination="false"
        row-key="__index"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'checkItem'">
            <Input
              :value="getFormFieldCellValue(record.__rowIndex, 'checkItem')"
              placeholder="请输入检验项目"
              @update:value="
                (val) =>
                  setFormFieldCellValue(record.__rowIndex, 'checkItem', val)
              "
            />
          </template>
          <template v-else-if="column.dataIndex === 'acceptanceCriteria'">
            <Input
              :value="
                getFormFieldCellValue(record.__rowIndex, 'acceptanceCriteria')
              "
              placeholder="请输入判定标准"
              @update:value="
                (val) =>
                  setFormFieldCellValue(
                    record.__rowIndex,
                    'acceptanceCriteria',
                    val,
                  )
              "
            />
          </template>
          <template v-else-if="column.dataIndex === 'actions'">
            <Popconfirm
              title="确认删除该检验项？"
              @confirm="removeFormFieldRow(record.__rowIndex)"
            >
              <Button danger size="small" type="link">删除</Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </div>

    <div
      v-if="showRawSpreadsheetEditor"
      class="mt-3 rounded border border-gray-200"
    >
      <UniverEditor ref="editorRef" @dirty="handleEditorDirty" />
    </div>

    <div class="mt-2 text-xs text-gray-500">
      上传原始 Excel 后会先转为字段表；字段表为主编辑入口，可选查看原始表格。
    </div>
  </Modal>
</template>

<style>
.qms-template-modal .ant-modal-content,
.qms-template-modal .ant-modal-body {
  overflow: visible;
}

.qms-template-modal .ant-modal,
.qms-template-modal .ant-modal-wrap {
  transform: none !important;
}

.qms-template-modal .univer-editor [data-radix-popper-content-wrapper] {
  position: fixed !important;
  z-index: 3000 !important;
}
</style>
