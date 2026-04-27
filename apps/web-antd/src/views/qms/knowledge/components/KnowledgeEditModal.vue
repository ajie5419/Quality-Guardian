<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { QmsKnowledgeApi } from '#/api/qms/knowledge';

import { computed, ref } from 'vue';

import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Button,
  Input,
  message,
  Modal,
  RadioButton,
  RadioGroup,
  Select,
  TreeSelect,
  Upload,
} from 'ant-design-vue';

import {
  createKnowledgeMutation,
  updateKnowledgeMutation,
} from '#/api/qms/knowledge';
import WangEditor from '#/components/WangEditor/index.vue';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineProps<{
  categoryTree: QmsKnowledgeApi.Category[];
}>();

const emit = defineEmits(['success']);

const userStore = useUserStore();
const accessStore = useAccessStore();
const { handleApiError } = useErrorHandler();

const visible = ref(false);
const editMode = ref(false);
const editorTab = ref<'edit' | 'preview'>('edit');
const attachmentFileList = ref<UploadFile[]>([]);

const formState = ref<Partial<QmsKnowledgeApi.KnowledgeItem>>({
  attachments: [],
  categoryId: '',
  content: '',
  status: 'published',
  summary: '',
  tags: [],
  title: '',
  version: 'V1.0',
});

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

function getFileExtension(fileName: string) {
  const suffix = fileName.split('.').pop();
  return suffix ? suffix.toLowerCase() : '';
}

function toUploadFiles(
  attachments: QmsKnowledgeApi.KnowledgeItem['attachments'] = [],
): UploadFile[] {
  return attachments.map((file, index) => ({
    name: file.name,
    size: file.size,
    status: 'done',
    type: file.type,
    uid: `${file.url}-${index}`,
    url: file.url,
  }));
}

function syncAttachmentsFromFiles(files: UploadFile[]) {
  formState.value.attachments = files
    .map((file) => {
      const response = file.response as
        | undefined
        | {
            data?: {
              originalName?: string;
              size?: number;
              url?: string;
            };
          };
      const url = String(file.url || response?.data?.url || '').trim();
      if (!url) return null;

      const name = String(
        file.name || response?.data?.originalName || '附件',
      ).trim();
      return {
        name,
        size: Number(file.size ?? response?.data?.size ?? 0),
        type: getFileExtension(name),
        url,
      };
    })
    .filter(Boolean) as QmsKnowledgeApi.KnowledgeItem['attachments'];
}

function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    const response = info.file.response as
      | undefined
      | {
          code?: number;
          data?: {
            originalName?: string;
            size?: number;
            url?: string;
          };
        };
    if (response?.code === 0 && response.data?.url) {
      info.file.url = response.data.url;
      message.success(`${info.file.name} 上传成功`);
    } else {
      message.warning('附件上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }

  attachmentFileList.value = [...info.fileList];
  syncAttachmentsFromFiles(attachmentFileList.value);
}

function open(
  item?: Partial<QmsKnowledgeApi.KnowledgeItem>,
  defaultCategoryId?: string,
) {
  if (item && item.id) {
    editMode.value = true;
    formState.value = { ...item };
    attachmentFileList.value = toUploadFiles(item.attachments || []);
  } else {
    editMode.value = false;
    const attachments = (item && item.attachments) || [];

    formState.value = {
      attachments,
      author: userStore.userInfo?.realName || 'Admin',
      categoryId: (item && item.categoryId) || defaultCategoryId || '',
      content: (item && item.content) || '',
      status: (item && item.status) || 'published',
      summary: (item && item.summary) || '',
      tags: (item && item.tags) || [],
      title: (item && item.title) || '',
      version: (item && item.version) || 'V1.0',
    };
    attachmentFileList.value = toUploadFiles(attachments);
  }
  editorTab.value = 'edit';
  visible.value = true;
}

async function handleSave() {
  try {
    const payload = {
      ...formState.value,
    };

    if (editMode.value && formState.value.id) {
      const result = await updateKnowledgeMutation(formState.value.id, payload);
      message.success(result.message || '更新成功');
    } else {
      const result = await createKnowledgeMutation(payload);
      message.success(result.message || '创建成功');
    }
    visible.value = false;
    emit('success', formState.value.id);
  } catch (error) {
    handleApiError(error, 'Save Knowledge');
    message.error('保存失败');
  }
}

defineExpose({ open });
</script>

<template>
  <Modal
    v-model:open="visible"
    :title="editMode ? '修订知识文档' : '发布新知识'"
    :width="800"
    @ok="handleSave"
  >
    <div class="space-y-4 pt-4">
      <div>
        <label class="mb-1 block text-sm font-medium">标题</label>
        <Input v-model:value="formState.title" placeholder="请输入文档标题" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm font-medium">分类</label>
          <TreeSelect
            v-model:value="formState.categoryId"
            :field-names="{
              children: 'children',
              label: 'name',
              value: 'id',
            }"
            :tree-data="categoryTree"
            class="w-full"
            placeholder="请选择分类"
            tree-default-expand-all
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium">版本号</label>
          <Input v-model:value="formState.version" placeholder="V1.0" />
        </div>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium">摘要 (200字以内)</label>
        <Input.TextArea
          v-model:value="formState.summary"
          :rows="2"
          placeholder="简要描述文档内容..."
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium">标签</label>
        <Select
          v-model:value="formState.tags"
          :options="[]"
          class="w-full"
          mode="tags"
          placeholder="请输入标签并回车确认"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium">附件</label>
        <Upload
          v-model:file-list="attachmentFileList"
          :headers="uploadHeaders"
          action="/api/upload"
          name="file"
          @change="handleAttachmentUploadChange"
        >
          <Button>上传附件</Button>
        </Upload>
        <div class="mt-1 text-xs text-gray-400">
          支持 PDF、Word、Excel、图片等文件，保存后会在知识详情中展示。
        </div>
      </div>
      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-sm font-medium">正文内容 (支持 HTML)</label>
          <RadioGroup
            v-model:value="editorTab"
            button-style="solid"
            size="small"
          >
            <RadioButton value="edit">编辑</RadioButton>
            <RadioButton value="preview">预览</RadioButton>
          </RadioGroup>
        </div>
        <div v-if="editorTab === 'edit'" key="editor-tab">
          <WangEditor v-model:value="formState.content" height="400px" />
        </div>
        <div
          v-if="editorTab === 'preview'"
          key="preview-tab"
          class="max-h-[400px] min-h-[294px] overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            class="prose prose-sm max-w-none"
            v-html="
              formState.content ||
              '<p class=\'text-gray-400 italic\'>暂无内容预览</p>'
            "
          ></div>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.prose :deep(h1) {
  @apply mb-4 text-2xl font-bold;
}

.prose :deep(h2) {
  @apply mb-3 mt-6 text-xl font-bold;
}

.prose :deep(h3) {
  @apply mb-2 mt-4 text-lg font-bold;
}

.prose :deep(p) {
  @apply mb-4 leading-relaxed text-gray-600;
}
</style>
