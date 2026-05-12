<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type {
  FileAssetItem,
  FileListParams,
  FileReferenceItem,
} from '#/api/qms/file-center';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  deleteFileAsset,
  getFileDetail,
  getFileList,
  getOrphanFileList,
  scanMissingFiles,
} from '#/api/qms/file-center';

defineOptions({ name: 'QMSFileCenter' });

const loading = ref(false);
const detailLoading = ref(false);
const scanLoading = ref(false);
const drawerOpen = ref(false);
const orphanMode = ref(false);
const files = ref<FileAssetItem[]>([]);
const total = ref(0);
const detail = ref<FileAssetItem | null>(null);

const query = reactive<FileListParams>({
  keyword: '',
  page: 1,
  pageSize: 20,
  status: 'ACTIVE',
});

const columns: TableColumnsType<FileAssetItem> = [
  { dataIndex: 'originalName', title: '文件名', width: 260 },
  { dataIndex: 'storageProvider', title: '存储', width: 90 },
  { dataIndex: 'mimeType', title: '类型', width: 180 },
  { dataIndex: 'size', title: '大小', width: 100 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'referenceCount', title: '引用', width: 90 },
  { dataIndex: 'createdAt', title: '上传时间', width: 170 },
  { dataIndex: 'action', fixed: 'right' as const, title: '操作', width: 180 },
];

const referenceColumns: TableColumnsType<FileReferenceItem> = [
  { dataIndex: 'bizType', title: '业务模块', width: 180 },
  { dataIndex: 'bizId', title: '业务 ID', width: 220 },
  { dataIndex: 'fieldName', title: '字段', width: 160 },
  { dataIndex: 'sortOrder', title: '排序', width: 80 },
  { dataIndex: 'createdAt', title: '引用时间', width: 170 },
];

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  showSizeChanger: true,
  total: total.value,
}));

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${Number.parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`;
}

function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

function getReferenceCount(file: FileAssetItem) {
  return file._count?.references ?? file.references?.length ?? 0;
}

function asFileAsset(record: Record<string, unknown>) {
  return record as unknown as FileAssetItem;
}

function resetPage() {
  query.page = 1;
}

async function loadFiles() {
  loading.value = true;
  try {
    const params = { ...query };
    const result = orphanMode.value
      ? await getOrphanFileList({
          page: params.page,
          pageSize: params.pageSize,
        })
      : await getFileList(params);
    files.value = result.items;
    total.value = result.total;
  } catch {
    message.error('加载文件列表失败');
  } finally {
    loading.value = false;
  }
}

function handleTableChange(pageInfo: { current?: number; pageSize?: number }) {
  query.page = pageInfo.current || 1;
  query.pageSize = pageInfo.pageSize || 20;
  void loadFiles();
}

async function openDetail(file: FileAssetItem) {
  drawerOpen.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getFileDetail(file.id);
  } catch {
    message.error('加载文件详情失败');
  } finally {
    detailLoading.value = false;
  }
}

function downloadFile(file: FileAssetItem) {
  window.open(`/api/files/${file.id}/download`, '_blank');
}

function previewFile(file: FileAssetItem) {
  window.open(`/api/files/${file.id}/preview`, '_blank');
}

function confirmDelete(file: FileAssetItem) {
  Modal.confirm({
    content: `文件会被软删除，并清理引用：${file.originalName}`,
    okText: '删除',
    okType: 'danger',
    title: '删除文件',
    async onOk() {
      await deleteFileAsset(file.id);
      message.success('文件已删除');
      await loadFiles();
      if (detail.value?.id === file.id) {
        drawerOpen.value = false;
        detail.value = null;
      }
    },
  });
}

async function handleScan(markMissing: boolean) {
  scanLoading.value = true;
  try {
    const result = await scanMissingFiles({ limit: 200, markMissing });
    message.success(
      `已检查 ${result.checked} 个文件，缺失 ${result.missingIds.length} 个，标记 ${result.marked} 个`,
    );
    await loadFiles();
  } catch {
    message.error('扫描缺失文件失败');
  } finally {
    scanLoading.value = false;
  }
}

function search() {
  resetPage();
  void loadFiles();
}

function toggleOrphans() {
  orphanMode.value = !orphanMode.value;
  resetPage();
  void loadFiles();
}

onMounted(loadFiles);
</script>

<template>
  <Page content-class="p-4">
    <div class="space-y-4">
      <Form layout="inline" @submit.prevent="search">
        <Form.Item label="关键词">
          <Input
            v-model:value="query.keyword"
            allow-clear
            placeholder="文件名 / 对象键 / SHA256"
            style="width: 260px"
            @press-enter="search"
          />
        </Form.Item>
        <Form.Item label="状态">
          <Select
            v-model:value="query.status"
            allow-clear
            style="width: 130px"
            :options="[
              { label: 'ACTIVE', value: 'ACTIVE' },
              { label: 'MISSING', value: 'MISSING' },
              { label: 'DELETED', value: 'DELETED' },
            ]"
          />
        </Form.Item>
        <Form.Item label="存储">
          <Select
            v-model:value="query.storageProvider"
            allow-clear
            style="width: 120px"
            :options="[
              { label: 'LOCAL', value: 'LOCAL' },
              { label: 'OSS', value: 'OSS' },
            ]"
          />
        </Form.Item>
        <Form.Item label="业务模块">
          <Input
            v-model:value="query.bizType"
            allow-clear
            placeholder="bizType"
            style="width: 180px"
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" @click="search">查询</Button>
            <Button
              :type="orphanMode ? 'primary' : 'default'"
              @click="toggleOrphans"
            >
              孤儿文件
            </Button>
            <Button :loading="scanLoading" @click="handleScan(false)">
              扫描缺失
            </Button>
            <Button danger :loading="scanLoading" @click="handleScan(true)">
              扫描并标记
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Table
        row-key="id"
        :columns="columns"
        :data-source="files"
        :loading="loading"
        :pagination="pagination"
        size="middle"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'originalName'">
            <div class="min-w-0">
              <div class="truncate font-medium">{{ record.originalName }}</div>
              <div class="truncate text-xs text-gray-500">
                {{ record.objectKey }}
              </div>
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'storageProvider'">
            <Tag :color="record.storageProvider === 'OSS' ? 'blue' : 'default'">
              {{ record.storageProvider }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'size'">
            {{ formatBytes(record.size) }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag
              :color="
                record.status === 'ACTIVE'
                  ? 'green'
                  : record.status === 'MISSING'
                    ? 'orange'
                    : 'red'
              "
            >
              {{ record.status }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'referenceCount'">
            {{ getReferenceCount(asFileAsset(record)) }}
          </template>
          <template v-else-if="column.dataIndex === 'createdAt'">
            {{ formatDate(record.createdAt) }}
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button
                size="small"
                type="link"
                @click="openDetail(asFileAsset(record))"
                >详情</Button
              >
              <Button
                size="small"
                type="link"
                @click="previewFile(asFileAsset(record))"
                >预览</Button
              >
              <Button
                size="small"
                type="link"
                @click="downloadFile(asFileAsset(record))"
              >
                下载
              </Button>
              <Button
                danger
                size="small"
                type="link"
                @click="confirmDelete(asFileAsset(record))"
              >
                删除
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <Drawer
      v-model:open="drawerOpen"
      destroy-on-close
      title="文件详情"
      width="860"
    >
      <Spin :spinning="detailLoading">
        <div v-if="detail" class="space-y-4">
          <Descriptions bordered :column="2" size="small">
            <Descriptions.Item label="文件名">
              {{ detail.originalName }}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {{ detail.status }}
            </Descriptions.Item>
            <Descriptions.Item label="存储">
              {{ detail.storageProvider }}
            </Descriptions.Item>
            <Descriptions.Item label="大小">
              {{ formatBytes(detail.size) }}
            </Descriptions.Item>
            <Descriptions.Item label="MIME">
              {{ detail.mimeType }}
            </Descriptions.Item>
            <Descriptions.Item label="上传人">
              {{ detail.uploadedBy || '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="SHA256" :span="2">
              {{ detail.sha256 }}
            </Descriptions.Item>
            <Descriptions.Item label="对象键" :span="2">
              {{ detail.objectKey }}
            </Descriptions.Item>
            <Descriptions.Item label="上传时间">
              {{ formatDate(detail.createdAt) }}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {{ formatDate(detail.updatedAt) }}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <div class="mb-2 font-medium">引用来源</div>
            <Table
              row-key="id"
              :columns="referenceColumns"
              :data-source="detail.references || []"
              :pagination="false"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'createdAt'">
                  {{ formatDate((record as FileReferenceItem).createdAt) }}
                </template>
              </template>
            </Table>
          </div>
        </div>
      </Spin>
    </Drawer>
  </Page>
</template>
