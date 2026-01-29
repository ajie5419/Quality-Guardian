<script lang="ts" setup>
import { ref } from 'vue';
import { Page } from '@vben/common-ui';
import { Segmented, Select, Modal, message } from 'ant-design-vue';
import { INSPECTION_TABS } from './config';
import InspectionGrid from './components/InspectionGrid.vue';
import InspectionForm from './components/InspectionForm.vue';
import { createInspectionRecord, updateInspectionRecord } from '#/api/qms/inspection';

const activeKey = ref('incoming');
const currentYear = ref(new Date().getFullYear());
const yearOptions = [2024, 2025, 2026].map(y => ({ label: `${y}年`, value: y }));

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
    if (isEdit.value) {
      await updateInspectionRecord(currentRecord.value.id, values);
    } else {
      await createInspectionRecord(values);
    }
    message.success('保存成功');
    modalVisible.value = false;
    gridRef.value?.reload();
  } catch(e) {
    console.error(e);
  }
}
</script>

<template>
  <Page>
    <div class="p-4 bg-white h-full flex flex-col">
      <div class="flex justify-between mb-4">
        <Segmented v-model:value="activeKey" :options="INSPECTION_TABS" />
        <Select v-model:value="currentYear" :options="yearOptions" class="w-32" />
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
      <InspectionForm 
        ref="formRef" 
        :type="activeKey" 
        :record="currentRecord" 
      />
    </Modal>
  </Page>
</template>
