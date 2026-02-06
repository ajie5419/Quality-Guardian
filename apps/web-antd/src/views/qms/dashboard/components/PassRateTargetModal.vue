<script lang="ts" setup>
import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Button,
  InputNumber,
  message,
  Modal,
  Spin,
  Table,
} from 'ant-design-vue';

import {
  getPassRateTargets,
  updatePassRateTargets,
} from '#/api/qms/dashboard/targets';

const emit = defineEmits(['success']);
const { t } = useI18n();
const visible = ref(false);
const loading = ref(false);
const saving = ref(false);
const dataSource = ref<any[]>([]);

const columns = [
  {
    title: t('qms.planning.itp.processStep'),
    dataIndex: 'process',
    key: 'process',
    width: 200,
  },
  {
    title: '目标合格率 (%)',
    dataIndex: 'passRate',
    key: 'passRate',
    width: 150,
  },
  {
    title: '隐含不合格率指标 (%)',
    dataIndex: 'defectRate',
    key: 'defectRate',
    width: 200,
  },
];

const loadData = async () => {
  loading.value = true;
  try {
    const targets = await getPassRateTargets();
    dataSource.value = Object.entries(targets)
      .map(([process, passRate]) => ({
        process,
        passRate,
        defectRate: Number((100 - passRate).toFixed(2)),
      }))
      .sort((a, b) => a.process.localeCompare(b.process, 'zh-CN'));
  } catch (error) {
    message.error('加载指标数据失败');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleOpen = () => {
  visible.value = true;
  loadData();
};

const handlePassRateChange = (val: number, record: any) => {
  record.passRate = val;
  record.defectRate = Number((100 - val).toFixed(2));
};

const handleDefectRateChange = (val: number, record: any) => {
  record.defectRate = val;
  record.passRate = Number((100 - val).toFixed(2));
};

const handleSave = async () => {
  saving.value = true;
  try {
    const targets: Record<string, number> = {};
    dataSource.value.forEach((item) => {
      targets[item.process] = item.passRate;
    });
    await updatePassRateTargets(targets);
    message.success('指标配置已更新');
    visible.value = false;
    emit('success');
  } catch (error) {
    message.error('保存指标失败');
    console.error(error);
  } finally {
    saving.value = false;
  }
};

defineExpose({
  open: handleOpen,
});
</script>

<template>
  <Modal
    v-model:open="visible"
    title="配置各工序目标合格率指标 (质量看板)"
    width="800px"
    @ok="handleSave"
    :confirm-loading="saving"
  >
    <div class="mb-4 text-sm text-gray-500">
      提示：修改此处的指标值会直接影响质量概览图表中的状态判定（颜色逻辑）。您可以随时修改并保存以进行手动测试。
    </div>
    <Spin :spinning="loading">
      <Table
        :data-source="dataSource"
        :columns="columns"
        :pagination="false"
        size="small"
        :scroll="{ y: 400 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'passRate'">
            <InputNumber
              v-model:value="record.passRate"
              :min="0"
              :max="100"
              :step="0.01"
              style="width: 100%"
              addon-after="%"
              @change="(val) => handlePassRateChange(val as number, record)"
            />
          </template>
          <template v-if="column.key === 'defectRate'">
            <InputNumber
              v-model:value="record.defectRate"
              :min="0"
              :max="100"
              :step="0.01"
              style="width: 100%"
              addon-after="%"
              @change="(val) => handleDefectRateChange(val as number, record)"
            />
          </template>
        </template>
      </Table>
    </Spin>
    <template #footer>
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-orange-500"
          >⚠️ 修改后将持久化存储，全局生效。</span
        >
        <div>
          <Button @click="visible = false">取消</Button>
          <Button type="primary" :loading="saving" @click="handleSave"
            >保存并应用</Button
          >
        </div>
      </div>
    </template>
  </Modal>
</template>
