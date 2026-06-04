<script lang="ts" setup>
import type { SupervisionDailyReport } from '@qgs/shared';

import { ref } from 'vue';

import {
  Button,
  Card,
  Drawer,
  Image,
  message,
  Progress,
  Space,
  Tag,
} from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';

interface Props {
  open: boolean;
  planTaskColor: (value?: string) => string;
  planTaskLabel: (value?: string) => string;
  report?: SupervisionDailyReport;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
const { isMobile } = useMobileViewport();

const shareCanvasRef = ref<HTMLElement | null>(null);
const shareLoading = ref(false);

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('canvas.toBlob returned null'));
      }
    }, 'image/png');
  });
}

async function handleShare() {
  if (!shareCanvasRef.value || !props.report) return;
  shareLoading.value = true;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(shareCanvasRef.value, {
      useCORS: true,
      scale: 2,
      backgroundColor: '#ffffff',
      ignoreElements: (element) => element.tagName === 'SCRIPT',
    });

    const projectName = props.report.projectName ?? '监造项目';
    const reportDate = props.report.reportDate ?? '';
    const fileName = `监造日报_${projectName}_${reportDate}.png`;

    const blob = await canvasToBlob(canvas);
    const file = new File([blob], fileName, { type: 'image/png' });

    // Try native share (mobile / supported browsers)
    if (
      'canShare' in navigator &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({ files: [file], title: '监造日报' });
      } catch (shareError) {
        if (shareError instanceof Error && shareError.name === 'AbortError') {
          // User cancelled — not an error, do nothing
          return;
        }
        throw shareError;
      }
    } else {
      // Fallback: download PNG
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      message.info('图片已保存，请打开微信选择图片发送');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    message.error('生成分享图片失败，请重试');
  } finally {
    shareLoading.value = false;
  }
}
</script>

<template>
  <!-- ============================================================
       Off-screen screenshot canvas — fixed 800px, invisible to user
       position:fixed + left:-9999px keeps it in DOM for html2canvas
       but outside viewport so it never affects layout
  ============================================================ -->
  <div
    v-if="props.report"
    ref="shareCanvasRef"
    style="
      position: fixed;
      top: 0;
      left: -9999px;
      box-sizing: border-box;
      width: 900px;
      padding: 40px;
      font-family:
        -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei',
        sans-serif;
      color: #1a1a1a;
      background-color: #fff;
    "
  >
    <!-- Title area -->
    <div
      style="
        padding-bottom: 24px;
        margin-bottom: 28px;
        text-align: center;
        border-bottom: 3px solid #2563eb;
      "
    >
      <div
        style="
          font-size: 32px;
          font-weight: 700;
          line-height: 1.3;
          color: #111827;
        "
      >
        {{ props.report.projectName ?? '' }}
      </div>
      <div
        v-if="props.report.workOrderNumber"
        style="margin-top: 10px; font-size: 16px; color: #6b7280"
      >
        工单号：{{ props.report.workOrderNumber }}
      </div>
      <div style="margin-top: 6px; font-size: 16px; color: #6b7280">
        监造现场日报
      </div>
      <div
        style="
          margin-top: 12px;
          font-size: 28px;
          font-weight: 700;
          color: #2563eb;
        "
      >
        {{ props.report.reportDate }}
      </div>
    </div>

    <!-- Basic info grid -->
    <div
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 14px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        基本信息
      </div>
      <div
        style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          font-size: 17px;
        "
      >
        <div>
          <div style="margin-bottom: 4px; font-size: 14px; color: #6b7280">
            监造员
          </div>
          <div style="font-weight: 500; color: #111827">
            {{ props.report.reporter || '-' }}
          </div>
        </div>
        <div>
          <div style="margin-bottom: 4px; font-size: 14px; color: #6b7280">
            现场人数
          </div>
          <div style="font-weight: 500; color: #111827">
            {{ props.report.manpower || '-' }}
          </div>
        </div>
        <div>
          <div style="margin-bottom: 4px; font-size: 14px; color: #6b7280">
            现场地点
          </div>
          <div style="font-weight: 500; color: #111827">
            {{ props.report.location || '-' }}
          </div>
        </div>
        <div>
          <div style="margin-bottom: 4px; font-size: 14px; color: #6b7280">
            天气
          </div>
          <div style="font-weight: 500; color: #111827">
            {{ props.report.weather || '-' }}
          </div>
        </div>
      </div>
      <div
        v-if="props.report.progressPercent > 0"
        style="margin-top: 16px; font-size: 16px"
      >
        <div style="margin-bottom: 8px; color: #6b7280">
          项目进度：{{ props.report.progressPercent }}%
        </div>
        <div
          style="
            height: 12px;
            overflow: hidden;
            background-color: #e5e7eb;
            border-radius: 6px;
          "
        >
          <div
            :style="{
              width: `${props.report.progressPercent}%`,
              height: '100%',
              backgroundColor: '#2563eb',
              borderRadius: '4px',
            }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Work content -->
    <div
      v-if="props.report.workContent"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        今日工作内容
      </div>
      <div
        style="
          font-size: 17px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
        "
      >
        {{ props.report.workContent }}
      </div>
    </div>

    <!-- Completed milestone -->
    <div
      v-if="props.report.completedMilestone"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        完成节点
      </div>
      <div
        style="
          font-size: 17px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
        "
      >
        {{ props.report.completedMilestone }}
      </div>
    </div>

    <!-- Task updates -->
    <div
      v-if="props.report.taskUpdates && props.report.taskUpdates.length > 0"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 14px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        任务推进情况
      </div>
      <div
        v-for="task in props.report.taskUpdates"
        :key="task.id ?? task.taskId"
        style="
          padding: 16px;
          margin-bottom: 10px;
          background-color: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        "
      >
        <div
          style="
            display: flex;
            gap: 8px;
            align-items: flex-start;
            justify-content: space-between;
          "
        >
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 18px; font-weight: 600; color: #111827">
              {{ task.taskNo }} {{ task.taskName }}
            </div>
            <div style="margin-top: 6px; font-size: 15px; color: #6b7280">
              数量：{{ task.completedQuantity ?? 0 }}/{{
                task.plannedQuantity ?? 0
              }}{{ task.quantityUnit ?? '' }}
              <span v-if="task.dailyQuantity" style="color: #16a34a">
                （本次 +{{ task.dailyQuantity }}{{ task.quantityUnit ?? '' }}）
              </span>
            </div>
          </div>
          <div style="text-align: right; white-space: nowrap">
            <div style="font-size: 26px; font-weight: 700; color: #2563eb">
              {{ task.progressPercent }}%
            </div>
          </div>
        </div>
        <div
          style="
            height: 8px;
            margin-top: 10px;
            overflow: hidden;
            background-color: #e5e7eb;
            border-radius: 4px;
          "
        >
          <div
            :style="{
              width: `${task.progressPercent}%`,
              height: '100%',
              backgroundColor: '#2563eb',
              borderRadius: '3px',
            }"
          ></div>
        </div>
        <div v-if="task.workContent" style="margin-top: 10px; font-size: 15px">
          <div style="color: #6b7280">工作内容</div>
          <div
            style="
              margin-top: 4px;
              line-height: 1.6;
              color: #374151;
              white-space: pre-wrap;
            "
          >
            {{ task.workContent }}
          </div>
        </div>
        <div v-if="task.nextPlan" style="margin-top: 10px; font-size: 15px">
          <div style="color: #6b7280">下一步计划</div>
          <div
            style="
              margin-top: 4px;
              line-height: 1.6;
              color: #374151;
              white-space: pre-wrap;
            "
          >
            {{ task.nextPlan }}
          </div>
        </div>
        <div v-if="task.riskReason" style="margin-top: 10px; font-size: 15px">
          <div style="color: #6b7280">风险原因</div>
          <div
            style="
              margin-top: 4px;
              line-height: 1.6;
              color: #d97706;
              white-space: pre-wrap;
            "
          >
            {{ task.riskReason }}
          </div>
        </div>
      </div>
    </div>

    <!-- Issue summary -->
    <div
      v-if="props.report.issueSummary"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #fff7ed;
        border: 1px solid #fed7aa;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #f97316;
        "
      >
        问题汇总
      </div>
      <div
        style="
          font-size: 17px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
        "
      >
        {{ props.report.issueSummary }}
      </div>
    </div>

    <!-- Tomorrow plan -->
    <div
      v-if="props.report.tomorrowPlan"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        明日计划
      </div>
      <div
        style="
          font-size: 17px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
        "
      >
        {{ props.report.tomorrowPlan }}
      </div>
    </div>

    <!-- Coordination needed -->
    <div
      v-if="props.report.coordinationNeeded"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 12px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        需要协调事项
      </div>
      <div
        style="
          font-size: 17px;
          line-height: 1.7;
          color: #374151;
          white-space: pre-wrap;
        "
      >
        {{ props.report.coordinationNeeded }}
      </div>
    </div>

    <!-- Photos -->
    <div
      v-if="props.report.attachments && props.report.attachments.length > 0"
      style="
        padding: 16px;
        margin-bottom: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
      "
    >
      <div
        style="
          padding-left: 10px;
          margin-bottom: 14px;
          font-size: 20px;
          font-weight: 600;
          color: #374151;
          border-left: 4px solid #2563eb;
        "
      >
        现场照片
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px">
        <img
          v-for="url in props.report.attachments"
          :key="url"
          :src="url"
          crossorigin="anonymous"
          style="
            display: block;
            width: 100%;
            height: 200px;
            object-fit: cover;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
          "
        />
      </div>
    </div>

    <!-- Footer -->
    <div
      style="
        padding-top: 20px;
        margin-top: 28px;
        font-size: 13px;
        color: #9ca3af;
        text-align: center;
        border-top: 1px solid #e5e7eb;
      "
    >
      由质量管理系统生成 · {{ new Date().toLocaleDateString('zh-CN') }}
    </div>
  </div>

  <!-- Main drawer -->
  <Drawer
    :open="props.open"
    title="监造日报详情"
    :width="isMobile ? '100vw' : 720"
    :body-style="{ overflowX: 'hidden', backgroundColor: '#f5f5f5' }"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.report" class="space-y-3">
      <Card size="small">
        <div class="text-center">
          <div class="text-lg font-semibold">
            {{ props.report.projectName }}
          </div>
          <div
            v-if="props.report.workOrderNumber"
            class="mt-1 text-sm text-gray-500"
          >
            工单号：{{ props.report.workOrderNumber }}
          </div>
          <div class="mt-1 text-sm text-gray-500">监造现场日报</div>
          <div class="mt-2 text-xl font-bold text-blue-600">
            {{ props.report.reportDate }}
          </div>
        </div>
      </Card>

      <Card size="small" title="基本信息">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-xs text-gray-500">监造员</div>
            <div class="font-medium">{{ props.report.reporter || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">现场人数</div>
            <div class="font-medium">{{ props.report.manpower || '—' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">现场地点</div>
            <div class="font-medium">{{ props.report.location || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">天气</div>
            <div class="font-medium">{{ props.report.weather || '-' }}</div>
          </div>
        </div>
        <div v-if="props.report.progressPercent > 0" class="mt-3">
          <div class="mb-1 text-xs text-gray-500">项目进度</div>
          <Progress :percent="props.report.progressPercent" />
        </div>
      </Card>

      <Card v-if="props.report.workContent" size="small" title="今日工作内容">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.workContent }}
        </div>
      </Card>

      <Card
        v-if="props.report.completedMilestone"
        size="small"
        title="完成节点"
      >
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.completedMilestone }}
        </div>
      </Card>

      <Card
        v-if="props.report.taskUpdates && props.report.taskUpdates.length > 0"
        size="small"
        title="任务推进情况"
      >
        <div class="space-y-3">
          <div
            v-for="task in props.report.taskUpdates"
            :key="task.id || task.taskId"
            class="rounded border bg-gray-50 p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">
                    {{ task.taskNo }} {{ task.taskName }}
                  </span>
                  <Tag :color="props.planTaskColor(task.status)">
                    {{ props.planTaskLabel(task.status) }}
                  </Tag>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  数量：{{ task.completedQuantity || 0 }}/{{
                    task.plannedQuantity || 0
                  }}{{ task.quantityUnit || '' }}
                  <span v-if="task.dailyQuantity" class="text-green-600">
                    （本次 +{{ task.dailyQuantity
                    }}{{ task.quantityUnit || '' }}）
                  </span>
                </div>
              </div>
              <div class="w-24 text-right">
                <div class="text-lg font-semibold text-blue-600">
                  {{ task.progressPercent }}%
                </div>
              </div>
            </div>
            <Progress
              class="mt-2"
              :percent="task.progressPercent"
              size="small"
            />
            <div v-if="task.workContent" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">工作内容</div>
              <div class="mt-1 whitespace-pre-wrap">{{ task.workContent }}</div>
            </div>
            <div v-if="task.nextPlan" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">下一步计划</div>
              <div class="mt-1 whitespace-pre-wrap">{{ task.nextPlan }}</div>
            </div>
            <div v-if="task.riskReason" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">风险原因</div>
              <div class="mt-1 whitespace-pre-wrap text-orange-600">
                {{ task.riskReason }}
              </div>
            </div>
            <div v-if="task.photos && task.photos.length > 0" class="mt-2">
              <div class="mb-1 text-xs text-gray-500">现场照片</div>
              <div class="flex flex-wrap gap-2">
                <Image
                  v-for="url in task.photos"
                  :key="url"
                  :src="url"
                  :width="80"
                  :height="80"
                  class="rounded object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card v-if="props.report.issueSummary" size="small" title="问题汇总">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.issueSummary }}
        </div>
      </Card>

      <Card v-if="props.report.tomorrowPlan" size="small" title="明日计划">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.tomorrowPlan }}
        </div>
      </Card>

      <Card
        v-if="props.report.coordinationNeeded"
        size="small"
        title="需要协调事项"
      >
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.coordinationNeeded }}
        </div>
      </Card>

      <Card
        v-if="props.report.attachments && props.report.attachments.length > 0"
        size="small"
        title="现场照片"
      >
        <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Image
            v-for="url in props.report.attachments"
            :key="url"
            :src="url"
            class="rounded object-cover"
            :height="120"
          />
        </div>
      </Card>
    </div>
    <template #footer>
      <Space>
        <Button @click="emit('update:open', false)">关闭</Button>
        <Button
          v-if="props.report"
          type="primary"
          :loading="shareLoading"
          @click="handleShare"
        >
          分享图片
        </Button>
      </Space>
    </template>
  </Drawer>
</template>
