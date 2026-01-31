<script lang="ts" setup>
import type { QmsKnowledgeApi } from '#/api/qms/knowledge';

import { ref } from 'vue';

import { Input, message, Modal } from 'ant-design-vue';

import { createCategory, updateCategory } from '#/api/qms/knowledge';

const emit = defineEmits(['success']);

const visible = ref(false);
const editMode = ref(false);
const currentCategoryId = ref<null | string>(null);

const formState = ref({
  description: '',
  name: '',
  parentId: undefined as string | undefined,
});

function open(parentId?: string, category?: QmsKnowledgeApi.Category) {
  if (category) {
    editMode.value = true;
    currentCategoryId.value = category.id;
    formState.value = {
      description: category.description || '',
      name: category.name,
      parentId: category.parentId,
    };
  } else {
    editMode.value = false;
    currentCategoryId.value = null;
    formState.value = {
      description: '',
      name: '',
      parentId,
    };
  }
  visible.value = true;
}

async function handleSave() {
  if (!formState.value.name) return message.warning('请输入分类名称');
  try {
    if (editMode.value && currentCategoryId.value) {
      await updateCategory(currentCategoryId.value, formState.value);
      message.success('分类更新成功');
    } else {
      await createCategory(formState.value);
      message.success('分类创建成功');
    }
    visible.value = false;
    emit('success');
  } catch {
    message.error('操作失败');
  }
}

defineExpose({ open });
</script>

<template>
  <Modal
    v-model:open="visible"
    :title="editMode ? '修改分类' : '新建分类'"
    :width="400"
    @ok="handleSave"
  >
    <div class="space-y-4 pt-4">
      <div>
        <label class="mb-1 block text-sm font-medium">分类名称</label>
        <Input v-model:value="formState.name" placeholder="请输入分类名称" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium">备注/描述</label>
        <Input.TextArea
          v-model:value="formState.description"
          :rows="2"
          placeholder="请输入分类描述"
        />
      </div>
    </div>
  </Modal>
</template>
