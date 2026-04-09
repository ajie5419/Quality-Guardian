<script lang="ts" setup>
import type { InspectionRecordPrintDetail } from '#/api/qms/inspection';

import { computed } from 'vue';

import { Button, Modal } from 'ant-design-vue';

const props = defineProps<{
  detail: InspectionRecordPrintDetail | null;
  loading?: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const printTitle = computed(() => {
  const detail = props.detail;
  if (!detail) return '检验资料打印';
  const project = String(detail.projectName || '').trim();
  const date = String(detail.inspectionDate || '').trim();
  return `${project || detail.workOrderNumber} - ${date || '检验资料'}`;
});

const reportHeader = computed(() => {
  const detail = props.detail;
  const rawFormName = String(detail?.templateName || '').trim();
  const normalizedName = rawFormName.toLowerCase().replaceAll(/\s+/g, '');

  const isDimension =
    normalizedName === 'chicun' ||
    normalizedName.includes('dimension') ||
    rawFormName.includes('尺寸');
  const isWeld =
    normalizedName === 'hanfeng' ||
    normalizedName === 'hanjie' ||
    normalizedName.includes('weld') ||
    rawFormName.includes('焊缝') ||
    rawFormName.includes('焊接');

  let formTitle = rawFormName || '检验表';
  if (isDimension) {
    formTitle = '尺寸检验表';
  } else if (isWeld) {
    formTitle = '焊接检验表';
  }

  let englishTitle = 'Inspection Records';
  if (isDimension) {
    englishTitle = 'Dimension Inspection Records';
  } else if (isWeld) {
    englishTitle = 'Weld Inspection Records';
  } else if (rawFormName) {
    englishTitle = `${rawFormName} Inspection Records`;
  }
  return {
    drawingNo: String(detail?.drawingNo || '').trim() || '-',
    englishTitle,
    formNo:
      String(detail?.formNo || '').trim() ||
      String(detail?.serialNumber || '').trim() ||
      '-',
    formTitle,
    partName:
      String(detail?.level2Component || '').trim() ||
      String(detail?.materialName || '').trim() ||
      '-',
    projectName: String(detail?.projectName || '').trim() || '-',
    quantity: String(detail?.quantity ?? '').trim() || '-',
    workOrderNumber: String(detail?.workOrderNumber || '').trim() || '-',
  };
});

const printHeaders = computed(() => ({
  checkItem: String(props.detail?.printHeaders?.checkItem || '检查项目').trim(),
  measuredValue: String(
    props.detail?.printHeaders?.measuredValue || '实测值',
  ).trim(),
  remarks: String(props.detail?.printHeaders?.remarks || '备注').trim(),
  standard: String(props.detail?.printHeaders?.standard || '标准值').trim(),
}));

type PrintRow = {
  checkItem: string;
  id: string;
  index: number;
  measuredValue: string;
  remarks: string;
  standardValue: string;
};

type MergedPrintRow = PrintRow & {
  checkItemRowSpan: number;
  showCheckItem: boolean;
};

function normalizeCheckItemKey(value: unknown) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';

  // Group key should be the semantic title of check item, not bracket payload/unit.
  const head = raw.split(/[（(]/)[0] || raw;
  return head
    .replaceAll(/\s+/g, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function buildMergedRows(rows: PrintRow[]): MergedPrintRow[] {
  return rows.map((row, index) => {
    const currentKey = normalizeCheckItemKey(row.checkItem);
    if (!currentKey) {
      return { ...row, checkItemRowSpan: 1, showCheckItem: true };
    }

    const previous = rows[index - 1];
    if (previous && normalizeCheckItemKey(previous.checkItem) === currentKey) {
      return { ...row, checkItemRowSpan: 0, showCheckItem: false };
    }

    let span = 1;
    for (let i = index + 1; i < rows.length; i++) {
      if (normalizeCheckItemKey(rows[i]?.checkItem) !== currentKey) {
        break;
      }
      span++;
    }
    return { ...row, checkItemRowSpan: span, showCheckItem: true };
  });
}

function appendUnit(text: string, uom?: string) {
  const base = String(text || '').trim();
  const unit = String(uom || '').trim();
  if (!unit) return base;
  return base ? `${base}（${unit}）` : unit;
}

function resolveStandardValue(item: {
  acceptanceCriteria?: null | string;
  lowerTolerance?: null | number;
  standardValue?: null | string;
  uom?: null | string;
  upperTolerance?: null | number;
}) {
  const criteria = String(item.acceptanceCriteria || '').trim();
  if (criteria) {
    const unit = String(item.uom || '').trim();
    if (unit && !criteria.toLowerCase().includes(unit.toLowerCase())) {
      return appendUnit(criteria, unit);
    }
    return criteria;
  }

  const standardValue = String(item.standardValue || '').trim();
  if (!standardValue) {
    return '-';
  }

  const withUnit = appendUnit(standardValue, String(item.uom || ''));
  const upper = Number(item.upperTolerance || 0);
  const lower = Number(item.lowerTolerance || 0);
  return `${withUnit} (+${upper}/-${lower})`;
}

const tableRows = computed<PrintRow[]>(() => {
  const rows = (props.detail?.items || []).map((item, index) => {
    return {
      ...item,
      checkItem: appendUnit(
        String(item.checkItem || '').trim(),
        String(item.uom || ''),
      ),
      index: index + 1,
      measuredValue: String(item.measuredValue || '').trim(),
      remarks: String(item.remarks || '').trim(),
      standardValue: resolveStandardValue(item),
    };
  });
  return rows;
});

const previewRows = computed(() => buildMergedRows(tableRows.value));

function handleClose() {
  emit('update:open', false);
}

function handlePrint() {
  if (!props.detail) return;

  const logoUrl = `${window.location.origin}/logo-tolian.png`;
  const header = `
    <table class="header-table">
      <colgroup>
        <col style="width:10%;" />
        <col style="width:20%;" />
        <col style="width:24%;" />
        <col style="width:21%;" />
        <col style="width:25%;" />
      </colgroup>
      <tr>
        <td class="logo-cell" colspan="2">
          <img src="${logoUrl}" alt="TOLIAN" />
        </td>
        <td class="title-cell" colspan="3">
          <div class="zh-title">${reportHeader.value.formTitle}</div>
          <div class="en-title">${reportHeader.value.englishTitle}</div>
        </td>
      </tr>
      <tr>
        <td class="label-cell" colspan="2">表单号及版本：<br/>Form No. & Rev.</td>
        <td class="value-cell value-cell-code">${reportHeader.value.formNo}</td>
        <td class="label-cell">产品名称<br/>Project</td>
        <td class="value-cell">${reportHeader.value.projectName}</td>
      </tr>
      <tr>
        <td class="label-cell" colspan="2">部件名称<br/>Part Name</td>
        <td class="value-cell">${reportHeader.value.partName}</td>
        <td class="label-cell">工单号<br/>Project NO.</td>
        <td class="value-cell value-cell-code">${reportHeader.value.workOrderNumber}</td>
      </tr>
      <tr>
        <td class="label-cell" colspan="2">图号：<br/>Drawing NO.</td>
        <td class="value-cell">${reportHeader.value.drawingNo}</td>
        <td class="label-cell">数量<br/>Qty.</td>
        <td class="value-cell">${reportHeader.value.quantity}</td>
      </tr>
    </table>
  `;

  const rowsPerPage = 14;
  const sourceRows = [...tableRows.value];
  const chunks: PrintRow[][] = [];
  for (let i = 0; i < sourceRows.length; i += rowsPerPage) {
    chunks.push(sourceRows.slice(i, i + rowsPerPage));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }

  const paddedChunks = chunks.map((chunk, pageIndex) => {
    const padded = [...chunk];
    const startIndex = pageIndex * rowsPerPage;
    while (padded.length < rowsPerPage) {
      padded.push({
        checkItem: '',
        id: `print-empty-${pageIndex + 1}-${padded.length + 1}`,
        index: startIndex + padded.length + 1,
        measuredValue: '',
        remarks: '',
        standardValue: '',
      });
    }
    return buildMergedRows(padded);
  });

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${printTitle.value}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body {
            font-family: "PingFang SC","Microsoft YaHei",sans-serif;
            margin: 0;
            color: #1f2937;
            background: #fff;
          }
          .print-page {
            page-break-after: always;
            break-after: page;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .header-table { border-collapse: collapse; width: 100%; margin-bottom: 12px; table-layout: fixed; }
          .header-table td { border: 1px solid #222; padding: 6px 8px; text-align: center; vertical-align: middle; }
          .logo-cell img { max-width: 108px; max-height: 72px; object-fit: contain; }
          .title-cell { font-weight: 700; }
          .zh-title { font-size: 20px; line-height: 1.2; }
          .en-title { font-size: 13px; line-height: 1.2; margin-top: 2px; }
          .label-cell { font-weight: 700; font-size: 13px; line-height: 1.35; }
          .value-cell {
            font-size: 15px;
            font-weight: 600;
            line-height: 1.25;
            white-space: nowrap;
            word-break: keep-all;
            overflow-wrap: normal;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .value-cell-code { font-size: 13px; letter-spacing: 0; }
          .detail-table { border-collapse: collapse; width: 100%; table-layout: fixed; border: 1px solid #222; }
          .detail-table th, .detail-table td { border: 1px solid #222; padding: 8px 6px; font-size: 14px; vertical-align: middle; }
          .detail-table th { font-weight: 700; }
          .detail-table .center { text-align: center; }
          .detail-table .head-zh { display: block; font-size: 14px; line-height: 1.2; }
          .detail-table .head-en { display: block; font-size: 12px; line-height: 1.2; margin-top: 2px; }
          .detail-table tbody tr td { height: 34px; }
          .nowrap { white-space: nowrap; word-break: keep-all; overflow-wrap: normal; }
        </style>
      </head>
      <body>
        ${paddedChunks
          .map((chunk) => {
            const bodyRows = chunk
              .map(
                (item) => `
              <tr>
                <td class="center">${item.index}</td>
                ${
                  item.showCheckItem
                    ? `<td class="center" rowspan="${item.checkItemRowSpan}">${item.checkItem || ''}</td>`
                    : ''
                }
                <td class="center">${item.standardValue || ''}</td>
                <td class="center">${item.measuredValue || ''}</td>
                <td class="center">${item.remarks || ''}</td>
              </tr>
            `,
              )
              .join('');

            return `
              <section class="print-page">
                ${header}
                <table class="detail-table">
                  <colgroup>
                    <col style="width: 9%;" />
                    <col style="width: 29%;" />
                    <col style="width: 25%;" />
                    <col style="width: 25%;" />
                    <col style="width: 12%;" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="center"><span class="head-zh">序号</span><span class="head-en">No.</span></th>
                      <th class="center"><span class="head-zh">${printHeaders.value.checkItem || '检查项目'}</span><span class="head-en">Item</span></th>
                      <th class="center"><span class="head-zh">${printHeaders.value.standard || '标准要求（mm）'}</span><span class="head-en">Requirement</span></th>
                      <th class="center"><span class="head-zh">${printHeaders.value.measuredValue || '实测值（mm）'}</span><span class="head-en">Value</span></th>
                      <th class="center"><span class="head-zh">${printHeaders.value.remarks || '备注'}</span><span class="head-en">Remarks</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${bodyRows}
                    <tr>
                      <td colspan="2" class="center" style="font-weight:700;">
                        检验结论：<br/>Inspection Conclusion：
                      </td>
                      <td colspan="3" style="padding-left: 14px;">
                        □ 接受 Accepted&nbsp;&nbsp;□ 拒绝 Rejected
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding: 10px 16px; height: 56px;">
                        <div>施工班组 Foreman：</div>
                        <div style="height: 22px;"></div>
                      </td>
                      <td style="padding: 10px 16px; height: 56px;">
                        <div>质检员 Inspector：</div>
                        <div style="height: 22px;"></div>
                      </td>
                      <td colspan="2" class="nowrap" style="padding: 14px 16px; height: 56px;">
                        日期 Date：${props.detail?.inspectionDate || '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>
            `;
          })
          .join('')}
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
</script>

<template>
  <Modal
    :open="open"
    :title="printTitle"
    width="1100px"
    :confirm-loading="loading"
    :footer="null"
    @cancel="handleClose"
  >
    <div v-if="detail">
      <div class="mb-4 overflow-x-auto rounded border border-[#222]">
        <table class="w-full table-fixed border-collapse text-center">
          <colgroup>
            <col style="width: 10%" />
            <col style="width: 20%" />
            <col style="width: 24%" />
            <col style="width: 21%" />
            <col style="width: 25%" />
          </colgroup>
          <tbody>
            <tr>
              <td class="border border-[#222] px-2 py-2" colspan="2">
                <img
                  src="/logo-tolian.png"
                  alt="TOLIAN"
                  class="mx-auto max-h-[72px] max-w-[108px] object-contain"
                />
              </td>
              <td class="border border-[#222] px-2 py-2" colspan="3">
                <div class="text-[20px] font-bold leading-[1.2]">
                  {{ reportHeader.formTitle }}
                </div>
                <div class="mt-0.5 text-[13px] font-semibold leading-tight">
                  {{ reportHeader.englishTitle }}
                </div>
              </td>
            </tr>
            <tr>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
                colspan="2"
              >
                表单号及版本<br />Form No. &amp; Rev.
              </td>
              <td
                class="whitespace-nowrap break-keep border border-[#222] px-2 py-2 text-[13px] font-semibold"
              >
                {{ reportHeader.formNo }}
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
              >
                产品名称<br />Project
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[15px] font-semibold"
              >
                {{ reportHeader.projectName }}
              </td>
            </tr>
            <tr>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
                colspan="2"
              >
                部件名称<br />Part Name
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[15px] font-semibold"
              >
                {{ reportHeader.partName }}
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
              >
                工单号<br />Project NO.
              </td>
              <td
                class="whitespace-nowrap break-keep border border-[#222] px-2 py-2 text-[13px] font-semibold"
              >
                {{ reportHeader.workOrderNumber }}
              </td>
            </tr>
            <tr>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
                colspan="2"
              >
                图号<br />Drawing NO.
              </td>
              <td
                class="whitespace-nowrap break-keep border border-[#222] px-2 py-2 text-[15px] font-semibold"
              >
                {{ reportHeader.drawingNo }}
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[13px] font-semibold leading-5"
              >
                数量<br />Qty.
              </td>
              <td
                class="border border-[#222] px-2 py-2 text-[15px] font-semibold"
              >
                {{ reportHeader.quantity }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="overflow-x-auto rounded border border-[#222]">
        <table class="w-full table-fixed border-collapse border border-[#222]">
          <colgroup>
            <col style="width: 9%" />
            <col style="width: 29%" />
            <col style="width: 25%" />
            <col style="width: 25%" />
            <col style="width: 12%" />
          </colgroup>
          <thead>
            <tr>
              <th class="border border-[#222] px-2 py-2 text-center">
                <span class="block text-lg font-semibold leading-6">序号</span>
                <span class="block text-sm font-semibold leading-5">No.</span>
              </th>
              <th class="border border-[#222] px-2 py-2 text-center">
                <span class="block text-lg font-semibold leading-6">{{
                  printHeaders.checkItem || '检查项目'
                }}</span>
                <span class="block text-sm font-semibold leading-5">Item</span>
              </th>
              <th class="border border-[#222] px-2 py-2 text-center">
                <span class="block text-lg font-semibold leading-6">{{
                  printHeaders.standard || '标准要求（mm）'
                }}</span>
                <span class="block text-sm font-semibold leading-5"
                  >Requirement</span
                >
              </th>
              <th class="border border-[#222] px-2 py-2 text-center">
                <span class="block text-lg font-semibold leading-6">{{
                  printHeaders.measuredValue || '实测值（mm）'
                }}</span>
                <span class="block text-sm font-semibold leading-5">Value</span>
              </th>
              <th class="border border-[#222] px-2 py-2 text-center">
                <span class="block text-lg font-semibold leading-6">{{
                  printHeaders.remarks || '备注'
                }}</span>
                <span class="block text-sm font-semibold leading-5"
                  >Remarks</span
                >
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in previewRows"
              :key="row.id || row.index"
              class="h-[42px]"
            >
              <td class="border border-[#222] px-2 text-center">
                {{ row.index }}
              </td>
              <td
                v-if="row.showCheckItem"
                class="border border-[#222] px-2 text-center align-middle"
                :rowspan="row.checkItemRowSpan"
              >
                {{ row.checkItem || '' }}
              </td>
              <td class="border border-[#222] px-2 text-center">
                {{ row.standardValue || '' }}
              </td>
              <td class="border border-[#222] px-2 text-center">
                {{ row.measuredValue || '' }}
              </td>
              <td class="border border-[#222] px-2 text-center">
                {{ row.remarks || '' }}
              </td>
            </tr>
            <tr>
              <td
                class="border border-[#222] px-2 py-3 text-center text-lg font-semibold leading-7"
                colspan="2"
              >
                检验结论：<br />Inspection Conclusion：
              </td>
              <td class="border border-[#222] px-3 py-3 text-base" colspan="3">
                □ 接受 Accepted&nbsp;&nbsp;□ 拒绝 Rejected
              </td>
            </tr>
            <tr>
              <td
                class="h-[52px] border border-[#222] px-4 py-2 text-base"
                colspan="2"
              >
                <div>施工班组 Foreman：</div>
                <div class="h-6"></div>
              </td>
              <td class="h-[52px] border border-[#222] px-4 py-2 text-base">
                <div>质检员 Inspector：</div>
                <div class="h-6"></div>
              </td>
              <td
                class="h-[52px] whitespace-nowrap break-keep border border-[#222] px-4 py-3 text-base"
                colspan="2"
              >
                日期 Date：{{ detail.inspectionDate || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex justify-end">
        <Button type="primary" @click="handlePrint">打印资料</Button>
      </div>
    </div>
  </Modal>
</template>
