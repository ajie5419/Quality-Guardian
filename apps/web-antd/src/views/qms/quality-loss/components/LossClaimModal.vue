<script lang="ts" setup>
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';

import { computed, reactive, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, InputNumber, Modal, Space } from 'ant-design-vue';

const props = defineProps<{
  initialData: Partial<QmsQualityLossApi.QualityLossItem>;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
}>();

// 可编辑的表单数据
const formData = reactive({
  // 基本信息
  workOrderNumber: '',
  projectName: '',
  partName: '',
  issueId: '',
  issueDate: '',
  description: '',
  // 费用项目
  adminFee: 0,
  inspectionFee: 0,
  repairFee: 0,
  scrapCost: 0,
  logisticsCost: 0,
  downtimeCost: 0,
  // 返修详情
  repairDept: '售后部',
  repairPersonnel: '组装操作员',
  repairHours: 10,
  // 备注
  notes:
    '(a) 以上费用在货款中扣除\n(b) 供应商质量赔偿表原件与传真件具有同等法律效力',
});

// 当 initialData 变化时初始化表单
watch(
  () => props.initialData,
  (data) => {
    if (data) {
      formData.projectName = data.projectName || '';
      formData.partName = data.partName || '';
      formData.issueId = data.id
        ? `TLSP-${data.id.slice(-4).toUpperCase()}`
        : '';
      formData.issueDate = data.date || '';
      formData.description = data.description || '';
      formData.workOrderNumber = data.workOrderNumber || '';
      formData.repairFee = data.actualClaim || data.amount || 0;
    }
  },
  { immediate: true },
);

const today = computed(() =>
  new Date().toLocaleDateString('zh-CN').replaceAll('/', '.'),
);

// 计算总费用
const totalAmount = computed(() => {
  return (
    formData.adminFee +
    formData.inspectionFee +
    formData.repairFee +
    formData.scrapCost +
    formData.logisticsCost +
    formData.downtimeCost
  );
});

const formattedTotal = computed(() =>
  totalAmount.value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
);

/**
 * 将金额转换为大写人民币
 */
function convertToChineseAmount(money: number): string {
  if (Number.isNaN(money) || money < 0) return '零元整';
  const cnNums = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const cnIntUnits = ['', '拾', '佰', '仟'];
  const cnIntRadice = ['', '万', '亿', '兆'];
  const cnDecUnits = ['角', '分', '厘', '毫'];
  const cnInteger = '整';
  const cnSymbol = '圆';
  const integral = Math.floor(money);
  const decimal = Math.round((money - integral) * 100);
  let res = '';

  if (integral > 0) {
    let zeroCount = 0;
    const integralStr = integral.toString();
    for (let i = 0; i < integralStr.length; i++) {
      const p = integralStr.length - i - 1;
      const d = integralStr[i] ?? '0';
      const quotient = Math.floor(p / 4);
      const modulus = p % 4;
      if (d === '0') {
        zeroCount++;
      } else {
        if (zeroCount > 0) {
          res += cnNums[0];
        }
        zeroCount = 0;
        res += (cnNums[Number.parseInt(d)] || '') + (cnIntUnits[modulus] || '');
      }
      if (modulus === 0 && zeroCount < 4) {
        res += cnIntRadice[quotient] || '';
      }
    }
    res += cnSymbol;
  }
  if (decimal > 0) {
    const d1 = Math.floor(decimal / 10);
    const d2 = decimal % 10;
    if (d1 > 0) res += (cnNums[d1] || '') + cnDecUnits[0];
    if (d2 > 0) res += (cnNums[d2] || '') + cnDecUnits[1];
  } else {
    res += cnInteger;
  }
  return res || '零元整';
}

const chineseAmount = computed(() => convertToChineseAmount(totalAmount.value));

function handlePrint() {
  window.print();
}
</script>

<template>
  <Modal
    :open="open"
    title="生成索赔赔偿表"
    @cancel="emit('update:open', false)"
    width="900px"
    destroy-on-close
    :footer="null"
  >
    <div class="flex flex-col items-center bg-gray-50 p-6">
      <Space class="no-print mb-4">
        <Button type="primary" @click="handlePrint">
          <template #icon><IconifyIcon icon="lucide:printer" /></template>
          直接打印
        </Button>
      </Space>

      <!-- 打印区域 -->
      <div
        class="print-content border border-gray-300 bg-white shadow-lg"
        id="printable-claim-area"
      >
        <!-- 表头 -->
        <div class="border-b-2 border-blue-700 px-8 pb-4 pt-6">
          <h1
            class="text-center text-2xl font-bold tracking-[0.3em] text-blue-800"
          >
            供应商质量成本赔偿表
          </h1>
          <div class="mt-3 flex justify-between text-xs text-gray-500">
            <span>版号：A0</span>
            <span>编号：TK/TL-PZ-018</span>
          </div>
        </div>

        <!-- 表格主体 -->
        <div class="px-6 py-4">
          <table class="claim-table w-full border-collapse text-sm">
            <!-- 基本信息区 -->
            <tbody>
              <tr>
                <td class="label-cell w-28">制表日期</td>
                <td class="value-cell print-value">{{ today }}</td>
                <td class="label-cell w-28">工单号</td>
                <td class="value-cell">
                  <Input
                    v-model:value="formData.workOrderNumber"
                    class="edit-input"
                    size="small"
                  />
                </td>
              </tr>
              <tr>
                <td class="label-cell">项目名称</td>
                <td class="value-cell">
                  <Input
                    v-model:value="formData.projectName"
                    class="edit-input"
                    size="small"
                    placeholder="输入项目名称"
                  />
                </td>
                <td class="label-cell">零件名称</td>
                <td class="value-cell">
                  <Input
                    v-model:value="formData.partName"
                    class="edit-input"
                    size="small"
                    placeholder="输入零件名称"
                  />
                </td>
              </tr>
              <tr>
                <td class="label-cell">问题编号</td>
                <td class="value-cell">
                  <Input
                    v-model:value="formData.issueId"
                    class="edit-input font-mono"
                    size="small"
                    placeholder="问题编号"
                  />
                </td>
                <td class="label-cell">发生日期</td>
                <td class="value-cell">
                  <Input
                    v-model:value="formData.issueDate"
                    class="edit-input"
                    size="small"
                    placeholder="YYYY-MM-DD"
                  />
                </td>
              </tr>
            </tbody>

            <!-- 不合格描述 -->
            <tbody>
              <tr>
                <td colspan="4" class="section-header">
                  <span class="i-lucide-alert-circle mr-1.5 text-base"></span>
                  不合格描述
                </td>
              </tr>
              <tr>
                <td colspan="4" class="description-cell">
                  <Input.TextArea
                    v-model:value="formData.description"
                    class="edit-textarea"
                    :rows="2"
                    placeholder="输入不合格描述..."
                  />
                </td>
              </tr>
            </tbody>

            <!-- 费用明细 -->
            <tbody>
              <tr>
                <td
                  colspan="4"
                  class="section-header bg-emerald-600 text-white"
                >
                  <span class="i-lucide-calculator mr-1.5 text-base"></span>
                  费用明细
                  <span class="ml-2 text-xs font-normal opacity-80"
                    >(可编辑)</span
                  >
                </td>
              </tr>
              <tr class="cost-header">
                <td class="w-16 text-center font-medium">序号</td>
                <td class="w-28 font-medium">费用项目</td>
                <td class="w-1/4 font-medium">明细说明</td>
                <td class="w-32 text-right font-medium">金额 (¥)</td>
              </tr>
              <tr>
                <td class="text-center">1</td>
                <td>行政处置费用</td>
                <td class="text-gray-500">鉴定及处理成本</td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.adminFee"
                    class="edit-number"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
              <tr>
                <td class="text-center">2</td>
                <td>检验活动</td>
                <td class="text-gray-500">质量人员/操作员工时</td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.inspectionFee"
                    class="edit-number"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
              <tr class="highlight-row">
                <td class="text-center font-bold">3</td>
                <td class="font-bold">返修费用</td>
                <td>
                  <div class="flex flex-wrap gap-2 text-xs">
                    <span class="flex items-center gap-1">
                      材料费:
                      <Input
                        v-model:value="formData.repairDept"
                        class="edit-input-sm"
                        size="small"
                        style="width: 80px"
                      />
                    </span>
                    <span class="flex items-center gap-1">
                      人员:
                      <Input
                        v-model:value="formData.repairPersonnel"
                        class="edit-input-sm"
                        size="small"
                        style="width: 80px"
                      />
                    </span>
                    <span class="flex items-center gap-1">
                      工时:
                      <InputNumber
                        v-model:value="formData.repairHours"
                        class="edit-number-sm"
                        :min="0"
                        size="small"
                        style="width: 60px"
                      />h
                    </span>
                  </div>
                </td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.repairFee"
                    class="edit-number highlight-input"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
              <tr>
                <td class="text-center">4</td>
                <td>报废成本</td>
                <td class="text-gray-500">相关零件损耗</td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.scrapCost"
                    class="edit-number"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
              <tr>
                <td class="text-center">5</td>
                <td>退货/物流</td>
                <td class="text-gray-500">物流成本及装卸</td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.logisticsCost"
                    class="edit-number"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
              <tr>
                <td class="text-center">6</td>
                <td>停工损失</td>
                <td class="text-gray-500">停工损失</td>
                <td class="text-right">
                  <InputNumber
                    v-model:value="formData.downtimeCost"
                    class="edit-number"
                    :min="0"
                    :precision="2"
                    size="small"
                  />
                </td>
              </tr>
            </tbody>

            <!-- 合计区 -->
            <tbody>
              <tr class="total-row">
                <td colspan="3" class="text-right font-bold">
                  供应商总赔偿金额
                </td>
                <td class="text-right font-mono text-xl font-bold text-red-600">
                  ¥{{ formattedTotal }}
                </td>
              </tr>
              <tr>
                <td class="label-cell">金额大写</td>
                <td
                  colspan="3"
                  class="value-cell text-right text-base font-medium tracking-wider"
                >
                  {{ chineseAmount }}
                </td>
              </tr>
            </tbody>

            <!-- 备注 -->
            <tbody>
              <tr>
                <td colspan="4" class="note-cell">
                  <div class="mb-1 font-medium text-blue-700">备注：</div>
                  <Input.TextArea
                    v-model:value="formData.notes"
                    class="edit-textarea-note"
                    :rows="2"
                  />
                </td>
              </tr>
            </tbody>

            <!-- 签字区 -->
            <tbody class="signature-section">
              <tr>
                <td class="signature-cell">
                  <div class="signature-title">生产部</div>
                  <div class="signature-line"></div>
                </td>
                <td class="signature-cell">
                  <div class="signature-title">品质部</div>
                  <div class="relative flex flex-col items-center">
                    <img
                      src="/signature-quality.png"
                      class="quality-signature absolute -top-8 left-1/2 h-10 w-auto -translate-x-1/2"
                      alt="Quality Signature"
                    />
                    <img
                      src="/seal-quality.png"
                      class="quality-seal absolute -top-16 h-20 w-auto opacity-80"
                      alt="Quality Seal"
                    />
                    <div class="signature-line w-full"></div>
                  </div>
                </td>
                <td class="signature-cell">
                  <div class="signature-title">采购部</div>
                  <div class="signature-line"></div>
                </td>
                <td class="signature-cell">
                  <div class="signature-title">财务部</div>
                  <div class="signature-line"></div>
                </td>
              </tr>
              <tr>
                <td colspan="4" class="supplier-signature">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="font-medium text-blue-700"
                        >供应商签字确认并盖章</span
                      >
                    </div>
                    <div class="flex items-center gap-8 text-xs text-gray-500">
                      <span>日期：____年____月____日</span>
                      <span
                        class="rounded border border-dashed border-gray-400 px-4 py-2"
                      >
                        (公章)
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
@media print {
  /* 1. 彻底隐藏页面上的所有元素 */
  @page {
    size: a4;
    margin: 0;
  }

  html,
  body {
    height: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }

  /* 隐藏 Vue 根节点、所有的 Ant Design 覆盖层、以及组件内的非打印元素 */
  #app,
  .ant-modal-mask,
  .ant-modal-wrap,
  .no-print,
  .ant-modal-header,
  .ant-modal-footer,
  .ant-modal-close {
    display: none !important;
    visibility: hidden !important;
  }

  /* 2. 强行把打印内容“提”出来，放在页面顶层 */
  #printable-claim-area {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 99999 !important;
    display: block !important;
    visibility: visible !important;
    width: 210mm !important;
    height: 297mm !important; /* 占据整张 A4 */
    padding: 0 10mm 20mm !important;
    margin: 0 !important;
    background: #fff !important;
    border: none !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* 确保打印区域内的所有内容都可见 */
  #printable-claim-area * {
    visibility: visible !important;
  }

  /* 打印时输入框 UI 去除：仅显示文本值 */
  .edit-input,
  .edit-input-sm,
  .edit-textarea,
  .edit-textarea-note,
  .edit-number,
  .edit-number-sm {
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  :deep(.ant-input),
  :deep(.ant-input-number),
  :deep(.ant-input-number-input) {
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }

  /* 背景色强制渲染 */
  .section-header {
    color: white !important;
    background-color: #2563eb !important;
  }

  .total-row td {
    background-color: #fef2f2 !important;
  }

  .cost-header td {
    background-color: #ecfdf5 !important;
  }

  .highlight-row {
    background-color: #fffbeb !important;
  }
}

.claim-table {
  font-family: 'PingFang SC', 'Microsoft YaHei', SimSun, sans-serif;
}

.claim-table td {
  padding: 10px 12px;
  vertical-align: middle;
  border: 1px solid #d1d5db;
}

.label-cell {
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  background-color: #f9fafb;
}

.value-cell {
  color: #1f2937;
}

.section-header {
  padding: 8px 12px !important;
  font-weight: 600;
  color: white;
  text-align: left;
  background-color: #2563eb;
}

.description-cell {
  padding: 8px !important;
  background-color: #fefce8;
}

.cost-header td {
  background-color: #ecfdf5;
  border-bottom: 2px solid #10b981 !important;
}

.highlight-row {
  background-color: #fffbeb;
}

.highlight-row td {
  border-top: 2px solid #f59e0b !important;
  border-bottom: 2px solid #f59e0b !important;
}

.total-row td {
  padding: 14px 12px !important;
  background-color: #fef2f2;
  border-top: 2px solid #ef4444 !important;
}

.note-cell {
  padding: 12px !important;
  background-color: #eff6ff;
}

.signature-section td {
  padding: 16px 12px !important;
}

.signature-cell {
  position: relative;
  min-height: 80px;
  text-align: center;
}

.quality-seal {
  z-index: 2;
  pointer-events: none;
  mix-blend-mode: multiply;
  filter: contrast(1.2) brightness(1.1);
}

.quality-signature {
  z-index: 1;
  pointer-events: none;
  mix-blend-mode: multiply;
}

.signature-title {
  margin-bottom: 30px;
  font-size: 12px;
  color: #6b7280;
}

.signature-line {
  margin: 0 16px;
  border-top: 1px solid #d1d5db;
}

.supplier-signature {
  padding: 16px !important;
  background-color: #f0f9ff;
}

/* 可编辑输入框样式 */
.edit-input,
.edit-input-sm {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.edit-input:hover,
.edit-input-sm:hover {
  background: #f0f9ff !important;
}

.edit-input:focus,
.edit-input-sm:focus {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgb(59 130 246 / 20%) !important;
}

.edit-textarea,
.edit-textarea-note {
  resize: none;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.edit-textarea:hover,
.edit-textarea-note:hover {
  background: rgb(255 255 255 / 50%) !important;
}

.edit-textarea:focus,
.edit-textarea-note:focus {
  background: #fff !important;
  box-shadow: 0 0 0 2px rgb(59 130 246 / 20%) !important;
}

.edit-number,
.edit-number-sm {
  width: 100%;
}

.edit-number :deep(.ant-input-number-input) {
  font-family: ui-monospace, monospace;
  text-align: right;
}

.highlight-input :deep(.ant-input-number-input) {
  font-weight: bold;
  color: #d97706;
}

/* 打印样式 */
.print-content {
  width: 210mm;
  min-height: auto;
}

/* 表格基础样式 */
</style>
