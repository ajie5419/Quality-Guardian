<script lang="ts" setup>
import type { QmsKnowledgeApi } from '#/api/qms/knowledge';

import { ref } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  Input,
  message,
  Modal,
  RadioButton,
  RadioGroup,
  Select,
  TreeSelect,
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
const { handleApiError } = useErrorHandler();

const visible = ref(false);
const editMode = ref(false);
const editorTab = ref<'edit' | 'preview'>('edit');

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

function open(
  item?: Partial<QmsKnowledgeApi.KnowledgeItem>,
  defaultCategoryId?: string,
) {
  if (item && item.id) {
    editMode.value = true;
    formState.value = { ...item };
    formState.value = { ...item };
  } else {
    editMode.value = false;
    // 如果是预填模式（没有 id 但有 attachments）
    // 如果是预填模式（没有 id 但有 attachments）

    formState.value = {
      attachments: (item && item.attachments) || [],
      author: userStore.userInfo?.realName || 'Admin',
      categoryId: (item && item.categoryId) || defaultCategoryId || '',
      content: (item && item.content) || '',
      status: (item && item.status) || 'published',
      summary: (item && item.summary) || '',
      tags: (item && item.tags) || [],
      title: (item && item.title) || '',
      version: (item && item.version) || 'V1.0',
    };
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
