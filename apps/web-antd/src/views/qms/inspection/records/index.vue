<script lang="ts" setup>
import { ref } from 'vue';

import { Page } from '@vben/common-ui';

import { message, Modal, Segmented, Select } from 'ant-design-vue';

import {
  createInspectionRecord,
  updateInspectionRecord,
} from '#/api/qms/inspection';

import InspectionForm from './components/InspectionForm.vue';
import InspectionGrid from './components/InspectionGrid.vue';
import { INSPECTION_TABS } from './config';

const activeKey = ref('incoming');
const currentYear = ref(new Date().getFullYear());
const yearOptions = [2024, 2025, 2026].map((y) => ({
  label: `${y}年`,
  value: y,
}));

const gridRef = ref();
const modalVisible = ref(false);
const formRef = ref();
const currentRecord = ref<any>(null);
const isEdit = ref(false);

function openModal(record?: any) {
  isEdit.value = !!record;
  currentRecord.value = record || null;
  modalVisible.value = true;
}

async function handleSubmit() {
  const values = formRef.value.getValues();
  // Transform category
  values.category = activeKey.value.toUpperCase();

  try {
    await (isEdit.value
      ? updateInspectionRecord(currentRecord.value.id, values)
      : createInspectionRecord(values));
    message.success('保存成功');
    modalVisible.value = false;
    gridRef.value?.reload();
  } catch (error) {
    console.error(error);
  }
}
</script>

<template>
  <Page>
    <div class="flex h-full flex-col bg-white p-4">
      <div class="mb-4 flex justify-between">
        <Segmented v-model:value="activeKey" :options="INSPECTION_TABS" />
        <Select
          v-model:value="currentYear"
          :options="yearOptions"
          class="w-32"
        />
      </div>

      <div class="flex-1 overflow-hidden">
        <InspectionGrid
          ref="gridRef"
          :type="activeKey"
          :year="currentYear"
          @create="openModal()"
          @edit="openModal"
        />
      </div>
    </div>

    <Modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑记录' : '新建记录'"
      width="1000px"
      @ok="handleSubmit"
    >
      <InspectionForm ref="formRef" :type="activeKey" :record="currentRecord" />
    </Modal>
  </Page>
</template>
