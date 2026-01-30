<script lang="ts" setup>
import { ref, nextTick } from 'vue';
import { useVbenModal } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { message } from 'ant-design-vue';
import { useVbenForm, z } from '#/adapter/form';
import { createWorkOrder, updateWorkOrder } from '#/api/qms/work-order';
import { getFormSchema, workOrderSchema } from '../data';

import type { OpenParams, WorkOrderRecord } from '../types/workOrder';

// ========== 2. 基础配置 ==========
const emit = defineEmits(['success']);
const { t } = useI18n();
const isUpdate = ref(false);
const recordId = ref<string | null>(null);

// ========== 3. 表单配置 ==========
const [Form, formApi] = useVbenForm({
  schema: [], // 初始为空数组，确保字段不存在时不会报错
  showDefaultActions: false,
  commonConfig: { componentProps: { class: 'w-full' } },
  wrapperClass: 'grid-cols-1',
  validationSchema: workOrderSchema,
});

// ========== 4. 弹窗配置 ==========
const [Modal, modalApi] = useVbenModal({
  title: t('qms.workOrder.createWorkOrder'),
  onConfirm: handleSubmit,
});

// ========== 5. 核心提交逻辑（修复缺陷 2：移除前端 createTime） ==========
async function handleSubmit() {
  try {
    // 1. 先验证表单
    const { valid } = await formApi.validate(true);
    if (!valid) return;

    // 2. 获取表单值
    const values = await formApi.getValues();

    modalApi.setState({ confirmLoading: true });

    // 清理数据：将 undefined 转换为空字符串/null
    const cleanedValues = {
      ...values,
      customerName: values.customerName || '',
      projectName: values.projectName || null,
      division: values.division || null,
      effectiveTime: values.effectiveTime || null, // 确保 null 而非空字符串
    };

    // ✅ 修复：移除前端生成的 createTime，由后端统一生成
    const submitApi = isUpdate.value && recordId.value
      ? () => updateWorkOrder(recordId.value!, cleanedValues)
      : () => createWorkOrder(cleanedValues);

    await submitApi();

    message.success(t('qms.common.saveSuccess'));
    modalApi.close();
    emit('success');
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || t('qms.common.actionFailed');
    message.error(errorMsg);
  } finally {
    modalApi.setState({ confirmLoading: false });
  }
}

// ========== 6. 打开弹窗逻辑（修复缺陷 1：编辑模式不重置表单） ==========
async function open({ record, deptData = [] }: OpenParams = {}) {
  try {
    // 1. 状态标记：使用 workOrderNumber 作为主键
    isUpdate.value = !!record?.workOrderNumber;
    recordId.value = record?.workOrderNumber || null;

    // 2. 弹窗配置
    modalApi.setState({
      title: isUpdate.value ? t('common.edit') : t('qms.workOrder.createWorkOrder'),
    });
    modalApi.open();

    // 3. 更新表单 schema
    const newSchema = getFormSchema(deptData);

    // 先设置 schema
    await formApi.setState({ schema: newSchema });

    // 等待表单字段渲染
    await nextTick();

    // 4. 准备默认值
    const today = new Date();
    const defaultValues = {
      workOrderNumber: isUpdate.value ? record?.workOrderNumber : `WO-${Date.now().toString().slice(-6)}`,
      customerName: record?.customerName || '',
      projectName: record?.projectName || '',
      division: record?.division || undefined,
      quantity: record?.quantity || 1,
      status: record?.status || 'OPEN',
      deliveryDate: record?.deliveryDate || today.toISOString().split('T')[0],
      effectiveTime: record?.effectiveTime || today.toISOString().split('T')[0],
    };

    // 分步设置：先 schema，再 values
    await formApi.setValues(defaultValues);

    // 5. 验证表单状态
    await nextTick();
  } catch (error) {
    console.error('弹窗打开失败:', error);
    message.error(t('qms.workOrder.initFailed'));
    modalApi.close();
  }
}

defineExpose({ open });
</script>

<template>
  <Modal>
    <Form />
  </Modal>
</template>
