<script lang="ts" setup>
import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import { createWorkOrder, updateWorkOrder } from '#/api/qms/work-order';

import { getFormSchema } from '../data';

const emit = defineEmits(['success']);
const { t } = useI18n();

const isUpdate = ref(false);
const recordId = ref<null | string>(null);

const [Form, formApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
  },
  wrapperClass: 'grid-cols-1',
});

const [Modal, modalApi] = useVbenModal({
  onConfirm: handleSubmit,
});

async function handleSubmit() {
  try {
    const { valid } = await formApi.validate();
    if (!valid) return;

    modalApi.setState({ confirmLoading: true });
    const values = await formApi.getValues();

    if (isUpdate.value && recordId.value) {
      await updateWorkOrder(recordId.value, values);
    } else {
      await createWorkOrder({
        ...values,
        createTime: new Date().toLocaleString(),
      });
    }

    message.success(t('common.saveSuccess'));
    modalApi.close();
    emit('success');
  } catch (error) {
    console.error('Submit failed:', error);
    message.error(t('common.actionFailed'));
  } finally {
    modalApi.setState({ confirmLoading: false });
  }
}

/**
 * 健壮的打开逻辑
 */
async function open(record?: any, deptData?: any[]) {
  console.log('WorkOrderModal: open triggered', { isUpdate: !!record });
  
  try {
    // 1. 优先打开容器，给用户视觉反馈
    modalApi.open();
    
    isUpdate.value = !!record;
    recordId.value = record?.id || null;

    // 2. 动态更新 Schema（改用最新的部门树）
    await formApi.setState({ schema: getFormSchema(deptData || []) });

    if (isUpdate.value && record) {
      // 编辑模式
      await formApi.setValues(record);
    } else {
      // 新建模式
      await formApi.resetForm();
      const defaultValues = {
        deliveryDate: new Date().toISOString().split('T')[0],
        effectiveTime: new Date().toISOString().split('T')[0],
        quantity: 1,
        workOrderNumber: `WO-${Date.now().toString().slice(-6)}`,
      };
      await formApi.setValues(defaultValues);
    }

    // 3. 设置标题
    modalApi.setState({
      title: isUpdate.value ? t('common.edit') : t('qms.workOrder.createWorkOrder'),
    });
    
    console.log('WorkOrderModal: init success');
  } catch (error) {
    console.error('WorkOrderModal Open Error:', error);
    message.error('工单编辑器初始化失败，请检查控制台日志');
  }
}

defineExpose({
  open,
});
</script>

<template>
  <Modal>
    <Form />
  </Modal>
</template>
