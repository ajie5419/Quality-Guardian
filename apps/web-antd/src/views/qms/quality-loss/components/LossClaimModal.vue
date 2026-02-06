<script lang="ts" setup>
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Modal, Space } from 'ant-design-vue';

const props = defineProps<{
  initialData: Partial<QmsQualityLossApi.QualityLossItem>;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
}>();

const printRef = ref<HTMLElement | null>(null);

const today = computed(() =>
  new Date().toLocaleDateString('zh-CN').replaceAll('/', '.'),
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

const chineseAmount = computed(() =>
  convertToChineseAmount(
    props.initialData.actualClaim || props.initialData.amount || 0,
  ),
);

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
    <div class="flex flex-col items-center bg-gray-100/50 p-4">
      <Space class="no-print mb-4">
        <Button type="primary" @click="handlePrint">
          <template #icon><IconifyIcon icon="lucide:printer" /></template>
          直接打印
        </Button>
      </Space>

      <!-- 打印区域 -->
      <div
        ref="printRef"
        class="print-content border border-gray-200 bg-white p-[20mm] shadow-xl"
        id="printable-claim-area"
      >
        <h1
          class="mb-6 border-b-2 border-blue-800 pb-2 text-center text-3xl font-bold tracking-widest text-blue-800"
        >
          供应商质量成本赔偿表
        </h1>

        <div
          class="grid grid-cols-3 gap-0 border-l border-t border-black text-[12px]"
        >
          <!-- Header Meta -->
          <div class="border-b border-r border-black bg-gray-50 p-2 font-bold">
            版号：AO
          </div>
          <div
            class="col-span-2 border-b border-r border-black bg-gray-50 p-2 font-bold"
          >
            编号：TK/JL-PZ-018
          </div>

          <div class="border-b border-r border-black p-1 pl-2">
            制表日期：{{ today }}
          </div>
          <div class="border-b border-r border-black p-1 pl-2">
            制表人：管理员
          </div>
          <div class="border-b border-r border-black p-1 pl-2">
            相关产品：{{ initialData.projectName || '-' }}
          </div>

          <div class="border-b border-r border-black p-1 pl-2">
            质量问题编号#：{{ initialData.id?.slice(-8)?.toUpperCase() || '-' }}
          </div>
          <div class="border-b border-r border-black p-1 pl-2">
            收款单位：质量中心
          </div>
          <div class="border-b border-r border-black p-1 pl-2">150t铁水车</div>

          <div class="border-b border-r border-black p-1 pl-2">
            问题发生日期：{{ initialData.date }}
          </div>
          <div class="border-b border-r border-black p-1 pl-2">
            零件编号：{{ initialData.partName || '-' }}
          </div>
          <div class="border-b border-r border-black p-1 pl-2">
            报警灯、空滤帽
          </div>

          <!-- Description -->
          <div
            class="border-b border-r border-black bg-blue-50/30 p-2 font-bold text-blue-800"
          >
            不合格描述：
          </div>
          <div
            class="col-span-2 min-h-[60px] border-b border-r border-black p-2"
          >
            {{ initialData.description || '暂无详细描述。' }}
          </div>

          <!-- Cost Sections Header -->
          <div
            class="border-b border-r border-black bg-green-500 p-1 text-center font-bold text-white"
          >
            分类
          </div>
          <div
            class="border-b border-r border-black bg-green-500 p-1 text-center font-bold text-white"
          >
            具体信息
          </div>
          <div
            class="border-b border-r border-black bg-green-500 p-1 text-center font-bold text-white"
          >
            总计
          </div>

          <!-- Row 1 -->
          <div class="border-b border-r border-black p-1 px-2 font-bold">
            1. 行政处置费用
          </div>
          <div class="border-b border-r border-black p-1 italic text-gray-400">
            鉴定及处理成本
          </div>
          <div class="border-b border-r border-black p-1 text-right">¥0.00</div>

          <!-- Row 2 -->
          <div class="border-b border-r border-black p-1 px-2 font-bold">
            2. 检验活动
          </div>
          <div class="border-b border-r border-black p-0">
            <table class="w-full border-collapse">
              <tr>
                <td class="w-24 border-b border-r border-black px-2 py-1">
                  操作员
                </td>
                <td class="border-b border-black italic text-gray-300">-</td>
              </tr>
              <tr>
                <td class="border-b border-r border-black px-2 py-1">
                  质量人员
                </td>
                <td class="border-b border-black italic text-gray-300">-</td>
              </tr>
              <tr>
                <td class="border-r border-black px-2 py-1">其他</td>
                <td class="italic text-gray-300">-</td>
              </tr>
            </table>
          </div>
          <div
            class="border-b border-r border-black p-1 text-right italic text-gray-400"
          >
            按需填列
          </div>

          <!-- Row 3 - The main one -->
          <div class="border-b border-r border-black p-1 px-2 font-bold">
            3. 返修
          </div>
          <div class="border-b border-r border-black p-0">
            <div class="grid grid-cols-2">
              <div class="border-r border-black p-2">人工: 组装操作员</div>
              <div class="p-2">数量: 1 | 人数: 3</div>
            </div>
            <div class="border-t border-black p-2">部门: 售后部 | 小时: 10</div>
          </div>
          <div
            class="border-b border-r border-black bg-yellow-50/30 p-4 text-center text-lg font-bold"
          >
            ¥{{
              (
                initialData.actualClaim ||
                initialData.amount ||
                0
              ).toLocaleString()
            }}
          </div>

          <!-- Row 4-7 placeholders -->
          <div class="border-b border-r border-black p-1 px-2 font-bold">
            4. 报废成本
          </div>
          <div class="border-b border-r border-black p-1">相关零件损耗</div>
          <div class="border-b border-r border-black p-1 text-right">¥0.00</div>

          <div class="border-b border-r border-black p-1 px-2 font-bold">
            5. 退货/物流
          </div>
          <div class="border-b border-r border-black p-1 italic text-gray-400">
            物流成本及装卸
          </div>
          <div class="border-b border-r border-black p-1 text-right">¥0.00</div>

          <div class="border-b border-r border-black p-1 px-2 font-bold">
            6. 停工损失
          </div>
          <div class="border-b border-r border-black p-1 italic text-gray-400">
            停线损失赔付
          </div>
          <div class="border-b border-r border-black p-1 text-right">¥0.00</div>

          <!-- Summary -->
          <div
            class="col-span-2 border-b border-r border-black p-2 text-right text-sm font-bold"
          >
            按照不合格处置报告供应商总的补偿额：
          </div>
          <div
            class="border-b border-r border-black p-2 text-right font-bold text-red-600"
          >
            ¥{{
              (
                initialData.actualClaim ||
                initialData.amount ||
                0
              ).toLocaleString()
            }}
          </div>

          <div
            class="col-span-3 border-b border-r border-black bg-gray-50 p-2 font-bold"
          >
            大写金额：<span class="ml-4 underline">{{ chineseAmount }}</span>
          </div>

          <!-- Footer Claims -->
          <div
            class="col-span-3 border-b border-r border-black p-2 text-[10px] text-blue-700"
          >
            <div>9. 备注：</div>
            <div>(a) 以上费用在货款中扣除</div>
            <div>(b) 供应商质量或本赔偿表原件与传真件具有同等法律效力</div>
          </div>

          <!-- Signatures -->
          <div
            class="min-h-[80px] border-b border-r border-black p-4 text-center"
          >
            生产部 / 售后部批准<br /><br />
            <div class="mx-4 mt-2 border-t border-gray-300"></div>
          </div>
          <div
            class="min-h-[80px] border-b border-r border-black p-4 text-center"
          >
            品质部 / 技术部批准<br /><br />
            <div class="mx-4 mt-2 border-t border-gray-300"></div>
          </div>
          <div
            class="min-h-[80px] border-b border-r border-black p-4 text-center"
          >
            采购部 / 外协部批准<br /><br />
            <div class="mx-4 mt-2 border-t border-gray-300"></div>
          </div>

          <div
            class="min-h-[80px] border-r border-black bg-gray-50/50 p-4 text-center"
          >
            财务中心确认扣款<br /><br />
            <div class="mx-4 mt-2 border-t border-black/20"></div>
          </div>
          <div
            class="col-span-2 min-h-[80px] border-r border-black p-4 text-center text-blue-800"
          >
            供应商签字确认并盖章<br /><br />
            <div class="flex justify-between px-10 text-[10px]">
              <span
                >日期: &nbsp;&nbsp;&nbsp;&nbsp;年 &nbsp;&nbsp;&nbsp;&nbsp;月
                &nbsp;&nbsp;&nbsp;&nbsp;日</span
              >
              <span>(公章)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }

  :deep(.ant-modal-mask),
  :deep(.ant-modal-wrap) {
    position: static !important;
    background: none !important;
  }

  :deep(.ant-modal) {
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  :deep(.ant-modal-content) {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  :deep(.ant-modal-body) {
    padding: 0 !important;
  }

  .print-content {
    display: block !important;
    width: 210mm !important;
    height: 297mm !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }

  body * {
    visibility: hidden;
  }

  #printable-claim-area,
  #printable-claim-area * {
    visibility: visible;
  }

  #printable-claim-area {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }

  h1 {
    color: #1e40af !important; /* text-blue-800 */
    border-color: #1e40af !important;
  }
}

.print-content {
  width: 210mm;
  min-height: 297mm;
  font-family: SimSun, STSong, serif;
}

td,
div {
  line-height: 1.5;
}
</style>
