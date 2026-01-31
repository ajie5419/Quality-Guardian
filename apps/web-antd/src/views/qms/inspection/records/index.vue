<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import { Modal, Segmented, Select } from 'ant-design-vue';

import InspectionForm from './components/InspectionForm.vue';
import InspectionGrid from './components/InspectionGrid.vue';
import { useInspectionRecords } from './composables/useInspectionRecords';
import { INSPECTION_TABS } from './config';

const {
  activeKey,
  currentYear,
  yearOptions,
  gridRef,
  formRef,
  modalVisible,
  currentRecord,
  isEdit,
  openModal,
  handleSubmit,
} = useInspectionRecords();
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
