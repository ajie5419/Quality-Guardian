<script lang="ts" setup>
import type { DailySummaryData } from '#/api/qms/reports';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { Button, DatePicker, Input, message, Tag } from 'ant-design-vue';
import html2canvas from 'html2canvas';

import { getDailySummary } from '#/api/qms/reports';
import { getDeptList } from '#/api/system/dept';
import { findNameById } from '#/types';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();

const canExport = computed(() => hasAccessByCodes(['QMS:Reports:Export']));

const currentDate = ref<string>(new Date().toISOString().split('T')[0] ?? '');
const loading = ref(false);
const summary = ref('');
const reportRef = ref<HTMLElement | null>(null); // Ref for screenshot area
const deptRawData = ref<any[]>([]);
const reportData = ref<DailySummaryData>({
  reporter: '',
  date: '',
  inspections: [],
  issues: [],
  summary: '',
});

async function loadDeptData() {
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    console.error('Failed to load department data', error);
  }
}

async function loadData() {
  loading.value = true;
  try {
    const data = await getDailySummary({
      date: currentDate.value,
      user: userStore.userInfo?.username,
    });
    reportData.value = data;
    summary.value = data.summary || '';
  } catch {
    message.error('加载报表失败');
  } finally {
    loading.value = false;
  }
}

async function handleExportImage() {
  if (!reportRef.value) return;
  try {
    loading.value = true;
    // Temporary Clone to strip risky elements if needed
    const canvas = await html2canvas(reportRef.value, {
      useCORS: true, // Try keeping true first, but if fails, user might need local only.
      // The error `cssRules` often comes from *reading* the rules.
      // html2canvas tries to read all stylesheets.
      // We can block it from reading external sheets by filtering them?
      // No easy way in config.
      // Let's try `allowTaint: true` and `useCORS: false`?
      // Actually, for Vben, the styles are critical.
      // Let's try ignoring elements that seem external?
      scale: 3,
      ignoreElements: (element) => {
        // Ignore Baidu statistics or other external scripts/links
        if (element.tagName === 'SCRIPT') return true;
        return false;
      },
    });
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `每日质量报表_${currentDate.value}_${userStore.userInfo?.realName || 'User'}.png`;
    link.click();
    message.success('图片导出成功');
  } catch (error) {
    console.error(error);
    // Fallback or specific message
    message.error('图片导出失败: 可能是跨域样式导致，请检查控制台');
  } finally {
    loading.value = false;
  }
}

watch(currentDate, () => {
  loadData();
});

onMounted(() => {
  loadData();
  loadDeptData();
});
</script>

<template>
  <Page>
    <div ref="reportRef" class="space-y-6 rounded-lg bg-white p-8 text-lg">
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-4">
        <div>
          <h1 class="mb-2 text-4xl font-bold">
            {{ t('qms.reports.dailyTitle') }}
          </h1>
          <div class="text-xl text-gray-500">DAILY QUALITY REPORT</div>
        </div>
        <div class="space-y-2 text-right">
          <div>
            <span class="mr-2 text-xl font-bold"
              >{{ t('qms.reports.reporter') }}:</span
            >
            <span class="text-xl">{{
              reportData.reporter || userStore.userInfo?.realName
            }}</span>
          </div>
          <div>
            <span class="mr-2 text-xl font-bold">日期:</span>
            <DatePicker
              v-model:value="currentDate"
              value-format="YYYY-MM-DD"
              :allow-clear="false"
              size="large"
            />
          </div>
        </div>
      </div>

      <!-- Section 1: Inspection Work -->
      <div>
        <div
          class="mb-0 inline-block bg-gray-800 px-4 py-2 text-xl font-bold text-white"
        >
          今日检验工作
        </div>
        <table class="w-full border-collapse border border-gray-300">
          <thead>
            <tr class="bg-gray-100 text-lg">
              <th class="w-16 whitespace-nowrap border p-2">序号</th>
              <th class="whitespace-nowrap border p-2">工单</th>
              <th class="whitespace-nowrap border p-2">项目名称</th>
              <th class="whitespace-nowrap border p-2">检验内容 (部件)</th>
              <th class="whitespace-nowrap border p-2">工序</th>
              <th class="w-24 whitespace-nowrap border p-2">数量</th>
              <th class="w-24 whitespace-nowrap border p-2">结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="reportData.inspections.length === 0">
              <td colspan="7" class="border p-4 text-center text-gray-500">
                今日无检验记录
              </td>
            </tr>
            <tr
              v-for="item in reportData.inspections"
              :key="item.seq"
              class="text-lg hover:bg-gray-50"
            >
              <td class="border p-2 text-center font-bold">{{ item.seq }}</td>
              <td class="whitespace-nowrap border p-2 font-bold">
                {{ item.workOrder }}
              </td>
              <td class="border p-2">{{ item.projectName }}</td>
              <td class="border p-2">{{ item.partName }}</td>
              <td class="border p-2">{{ item.process }}</td>
              <td class="border p-2 text-center">{{ item.quantity }}</td>
              <td
                class="border p-2 text-center font-bold"
                :class="
                  item.result === '合格' ? 'text-green-500' : 'text-red-500'
                "
              >
                {{ item.result }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section 2: Exceptions & Issues -->
      <div>
        <div
          class="mb-0 inline-block bg-gray-800 px-4 py-2 text-xl font-bold text-white"
        >
          异常与问题 (NCR)
        </div>
        <table class="w-full border-collapse border border-gray-300">
          <thead>
            <tr class="bg-gray-100 text-lg">
              <th class="w-16 whitespace-nowrap border p-2">序号</th>
              <th class="whitespace-nowrap border p-2">工单号</th>
              <th class="whitespace-nowrap border p-2">部件名称</th>
              <th class="whitespace-nowrap border p-2">问题描述</th>
              <th class="whitespace-nowrap border p-2">处置/方案</th>
              <th class="whitespace-nowrap border p-2">状态</th>
              <th class="w-32 whitespace-nowrap border p-2">责任部门</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="reportData.issues.length === 0">
              <td colspan="7" class="border p-4 text-center text-gray-500">
                无异常与问题
              </td>
            </tr>
            <tr
              v-for="item in reportData.issues"
              :key="item.seq"
              class="text-lg hover:bg-gray-50"
            >
              <td class="border p-2 text-center font-bold">{{ item.seq }}</td>
              <td class="whitespace-nowrap border p-2">{{ item.workOrder }}</td>
              <td class="border p-2 text-red-500">
                {{ item.partName }}
              </td>
              <td class="border p-2 text-red-500">
                {{ item.description }}
              </td>
              <td class="border p-2">{{ item.solution }}</td>
              <td class="border p-2 text-center">
                <Tag
                  :color="
                    item.status === 'Closed' || item.status === 'CLOSED'
                      ? 'success'
                      : 'error'
                  "
                >
                  {{
                    item.status === 'Closed' || item.status === 'CLOSED'
                      ? '关闭'
                      : '打开'
                  }}
                </Tag>
              </td>
              <td class="border p-2 text-center">
                {{ findNameById(deptRawData, item.dept) || item.dept }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Section 3: Summary -->
      <div class="relative border border-gray-300 p-4">
        <div class="mb-2 text-xl font-bold text-gray-500">
          个人成长/待办事项
        </div>
        <Input.TextArea
          v-model:value="summary"
          :rows="3"
          class="w-full resize-none !border-0 p-0 text-lg focus:!shadow-none"
          placeholder="请输入今日总结..."
        />
      </div>
    </div>

    <!-- Footer Actions (Outside of screenshot area to avoid capturing buttons) -->
    <div v-if="canExport" class="space-x-4 pt-4 text-center">
      <Button class="mr-4" @click="handleExportImage" :loading="loading">
        导出图片
      </Button>
    </div>
  </Page>
</template>
